use starknet::ContractAddress;

#[derive(Copy, Drop, Serde, starknet::Store)]
pub struct RaceInfo {
    pub racer: ContractAddress,
    pub challenge_id: u32,
    pub keystroke_count: u32,
    pub start_time: u64,
    pub end_time: u64,
    pub wpm: u32,
    pub accuracy: u32,
    pub finished: bool,
}

#[starknet::interface]
pub trait IERC20<TContractState> {
    fn transfer(ref self: TContractState, recipient: ContractAddress, amount: u256) -> bool;
    fn transfer_from(
        ref self: TContractState, sender: ContractAddress, recipient: ContractAddress, amount: u256,
    ) -> bool;
    fn balance_of(self: @TContractState, account: ContractAddress) -> u256;
}

#[starknet::interface]
pub trait ITypeRacer<TContractState> {
    fn start_race(ref self: TContractState, challenge_id: u32) -> u64;
    fn record_keystroke(ref self: TContractState, race_id: u64);
    fn finish_race(
        ref self: TContractState,
        race_id: u64,
        correct_chars: u32,
        total_chars: u32,
        wpm: u32,
        accuracy: u32,
    );
    fn get_race(self: @TContractState, race_id: u64) -> RaceInfo;
    fn get_user_best_wpm(self: @TContractState, user: ContractAddress) -> u32;
    fn get_user_race_count(self: @TContractState, user: ContractAddress) -> u32;
    fn get_total_races(self: @TContractState) -> u64;
    fn get_total_keystrokes(self: @TContractState) -> u64;

    // Reward functions
    fn distribute_reward(ref self: TContractState, user: ContractAddress, race_id: u64);
    fn deposit(ref self: TContractState, amount: u256);
    fn get_reward_balance(self: @TContractState) -> u256;
    fn get_race_rewarded(self: @TContractState, race_id: u64) -> bool;
    fn get_user_total_rewards(self: @TContractState, user: ContractAddress) -> u256;
    fn get_max_races(self: @TContractState) -> u32;
}

#[starknet::contract]
mod TypeRacerContract {
    use super::{RaceInfo, ITypeRacer, IERC20DispatcherTrait, IERC20Dispatcher};
    use starknet::{ContractAddress, get_caller_address, get_block_timestamp, get_contract_address};
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };

    const MAX_RACES_PER_USER: u32 = 3;
    // 0.1 STRK = 10^17 (STRK has 18 decimals)
    const REWARD_PER_WORD: u256 = 100_000_000_000_000_000;

    // STRK token on Sepolia
    const STRK_TOKEN_ADDRESS: felt252 =
        0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d;

    #[storage]
    struct Storage {
        admin: ContractAddress,
        race_counter: u64,
        total_keystrokes: u64,
        races: Map<u64, RaceInfo>,
        user_best_wpm: Map<ContractAddress, u32>,
        user_race_count: Map<ContractAddress, u32>,
        race_rewarded: Map<u64, bool>,
        user_total_rewards: Map<ContractAddress, u256>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        RaceStarted: RaceStarted,
        Keystroke: Keystroke,
        RaceFinished: RaceFinished,
        RewardDistributed: RewardDistributed,
        Deposited: Deposited,
    }

    #[derive(Drop, starknet::Event)]
    struct RaceStarted {
        #[key]
        racer: ContractAddress,
        race_id: u64,
        challenge_id: u32,
        timestamp: u64,
    }

    #[derive(Drop, starknet::Event)]
    struct Keystroke {
        #[key]
        racer: ContractAddress,
        race_id: u64,
        keystroke_number: u32,
        timestamp: u64,
    }

    #[derive(Drop, starknet::Event)]
    struct RaceFinished {
        #[key]
        racer: ContractAddress,
        race_id: u64,
        wpm: u32,
        accuracy: u32,
        keystroke_count: u32,
        elapsed_seconds: u64,
    }

    #[derive(Drop, starknet::Event)]
    struct RewardDistributed {
        #[key]
        user: ContractAddress,
        race_id: u64,
        word_count: u32,
        amount: u256,
    }

    #[derive(Drop, starknet::Event)]
    struct Deposited {
        #[key]
        depositor: ContractAddress,
        amount: u256,
    }

    #[constructor]
    fn constructor(ref self: ContractState, admin: ContractAddress) {
        self.admin.write(admin);
        self.race_counter.write(0);
        self.total_keystrokes.write(0);
    }

    #[abi(embed_v0)]
    impl TypeRacerImpl of ITypeRacer<ContractState> {
        fn start_race(ref self: ContractState, challenge_id: u32) -> u64 {
            let caller = get_caller_address();
            let timestamp = get_block_timestamp();

            // Enforce 3-race limit per user
            let race_count = self.user_race_count.read(caller);
            assert!(race_count < MAX_RACES_PER_USER, "Max 3 races per account");

            let race_id = self.race_counter.read();
            self.race_counter.write(race_id + 1);

            let race = RaceInfo {
                racer: caller,
                challenge_id,
                keystroke_count: 0,
                start_time: timestamp,
                end_time: 0,
                wpm: 0,
                accuracy: 0,
                finished: false,
            };
            self.races.write(race_id, race);

            self.emit(RaceStarted { racer: caller, race_id, challenge_id, timestamp });

            race_id
        }

        fn record_keystroke(ref self: ContractState, race_id: u64) {
            let caller = get_caller_address();
            let timestamp = get_block_timestamp();
            let mut race = self.races.read(race_id);

            // Silently return instead of reverting - late txs may arrive after race finishes
            if race.finished {
                return;
            }
            if caller != race.racer {
                return;
            }

            race.keystroke_count = race.keystroke_count + 1;
            self.races.write(race_id, race);

            let total = self.total_keystrokes.read();
            self.total_keystrokes.write(total + 1);

            self
                .emit(
                    Keystroke {
                        racer: caller, race_id, keystroke_number: race.keystroke_count, timestamp,
                    },
                );
        }

        fn finish_race(
            ref self: ContractState,
            race_id: u64,
            correct_chars: u32,
            total_chars: u32,
            wpm: u32,
            accuracy: u32,
        ) {
            let caller = get_caller_address();
            let timestamp = get_block_timestamp();
            let mut race = self.races.read(race_id);

            // Silently return if already finished (duplicate finish tx)
            if race.finished {
                return;
            }
            assert!(caller == race.racer, "Not your race");
            assert!(total_chars > 0, "No characters typed");

            let elapsed_seconds = timestamp - race.start_time;
            let elapsed = if elapsed_seconds == 0 {
                1_u64
            } else {
                elapsed_seconds
            };

            // Use client-provided WPM and accuracy directly
            // Block timestamps are imprecise, so client-side calculation is more accurate
            race.end_time = timestamp;
            race.wpm = wpm;
            race.accuracy = accuracy;
            race.finished = true;
            self.races.write(race_id, race);

            // Update user stats
            let prev_best = self.user_best_wpm.read(caller);
            if wpm > prev_best {
                self.user_best_wpm.write(caller, wpm);
            }
            let prev_count = self.user_race_count.read(caller);
            self.user_race_count.write(caller, prev_count + 1);

            self
                .emit(
                    RaceFinished {
                        racer: caller,
                        race_id,
                        wpm,
                        accuracy,
                        keystroke_count: race.keystroke_count,
                        elapsed_seconds: elapsed,
                    },
                );
        }

        fn get_race(self: @ContractState, race_id: u64) -> RaceInfo {
            self.races.read(race_id)
        }

        fn get_user_best_wpm(self: @ContractState, user: ContractAddress) -> u32 {
            self.user_best_wpm.read(user)
        }

        fn get_user_race_count(self: @ContractState, user: ContractAddress) -> u32 {
            self.user_race_count.read(user)
        }

        fn get_total_races(self: @ContractState) -> u64 {
            self.race_counter.read()
        }

        fn get_total_keystrokes(self: @ContractState) -> u64 {
            self.total_keystrokes.read()
        }

        // ─── Reward Functions ───

        fn distribute_reward(ref self: ContractState, user: ContractAddress, race_id: u64) {
            let caller = get_caller_address();
            let admin = self.admin.read();
            assert!(caller == admin, "Only admin can distribute rewards");

            let race = self.races.read(race_id);
            assert!(race.finished, "Race not finished");
            assert!(race.racer == user, "User does not own this race");

            let already_rewarded = self.race_rewarded.read(race_id);
            assert!(!already_rewarded, "Race already rewarded");

            let word_count = race.keystroke_count; // keystroke_count = correct words
            assert!(word_count > 0, "No words completed");

            let amount: u256 = word_count.into() * REWARD_PER_WORD;

            // Transfer STRK from contract to user
            let strk_address: ContractAddress = STRK_TOKEN_ADDRESS.try_into().unwrap();
            let strk = IERC20Dispatcher { contract_address: strk_address };
            let success = strk.transfer(user, amount);
            assert!(success, "STRK transfer failed");

            // Mark race as rewarded
            self.race_rewarded.write(race_id, true);

            // Track total rewards per user
            let prev_total = self.user_total_rewards.read(user);
            self.user_total_rewards.write(user, prev_total + amount);

            self.emit(RewardDistributed { user, race_id, word_count, amount });
        }

        fn deposit(ref self: ContractState, amount: u256) {
            let caller = get_caller_address();
            let admin = self.admin.read();
            assert!(caller == admin, "Only admin can deposit");

            let contract_address = get_contract_address();
            let strk_address: ContractAddress = STRK_TOKEN_ADDRESS.try_into().unwrap();
            let strk = IERC20Dispatcher { contract_address: strk_address };
            let success = strk.transfer_from(caller, contract_address, amount);
            assert!(success, "STRK deposit failed");

            self.emit(Deposited { depositor: caller, amount });
        }

        fn get_reward_balance(self: @ContractState) -> u256 {
            let contract_address = get_contract_address();
            let strk_address: ContractAddress = STRK_TOKEN_ADDRESS.try_into().unwrap();
            let strk = IERC20Dispatcher { contract_address: strk_address };
            strk.balance_of(contract_address)
        }

        fn get_race_rewarded(self: @ContractState, race_id: u64) -> bool {
            self.race_rewarded.read(race_id)
        }

        fn get_user_total_rewards(self: @ContractState, user: ContractAddress) -> u256 {
            self.user_total_rewards.read(user)
        }

        fn get_max_races(self: @ContractState) -> u32 {
            MAX_RACES_PER_USER
        }
    }
}

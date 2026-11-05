//! Gachard cards: a NEP-245 multi token contract for creator-released TCG cards.
//!
//! Every card is its own token id with a supply of 1. The contract records who
//! released it (series -> creator account), what it is (template, with a hash of
//! the artwork), who holds it, whether it is locked for print, and its history.
//!
//! Who can do what:
//! - The holder moves their own card, and locks it for print. Nobody else can:
//!   there is deliberately no method that lets the platform move a card.
//! - An approved creator's own account creates a series and adds its templates.
//! - The minter (the platform) mints from existing templates. It cannot change
//!   a template, and it cannot move a card once minted. It can mint any amount
//!   from any template, so "released by this creator" means the creator's account
//!   published the template, not that the creator approved each mint.
//! - Whoever holds a printed card's code redeems it, and the card moves to them.
//!   The code itself is checked, against a hash bound to the token and the print
//!   cycle. A caller cannot pass a stored hash back: the contract computes it.

use near_sdk::json_types::{Base64VecU8, U128};
use near_sdk::serde_json::json;
use near_sdk::store::{LookupMap, LookupSet};
use near_sdk::{
    AccountId, Gas, PanicOnDefault, PromiseError, PromiseOrValue, assert_one_yocto, env,
    ext_contract, near, require,
};

const MAX_HISTORY: usize = 32;
const MAX_BATCH: usize = 20;
const MAX_MINT: usize = 10;
const MAX_TEMPLATES_PER_SERIES: u32 = 200;
const MAX_NAME: usize = 64;
const MAX_MEDIA: usize = 256;
const MAX_MEMO: usize = 256;
const MIN_CODE: usize = 16;
const MAX_CODE: usize = 64;
const RATE_TOTAL_BPS: u32 = 10_000;
const RARITIES: [&str; 4] = ["Common", "Rare", "Epic", "Legendary"];

const GAS_ON_TRANSFER: Gas = Gas::from_tgas(30);
const GAS_RESOLVE: Gas = Gas::from_tgas(15);
const GAS_MINIMUM_FOR_CALL: Gas = Gas::from_tgas(55);

#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum CardStatus {
    Digital,
    Printed,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum HistoryKind {
    Mint,
    Transfer,
    Print,
    Redeem,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]
pub struct HistoryEntry {
    pub kind: HistoryKind,
    pub from: Option<AccountId>,
    pub to: AccountId,
    pub block_height: u64,
    pub at_ms: u64,
}

#[near(serializers = [borsh])]
#[derive(Clone)]
pub struct Card {
    series_id: u32,
    template_id: u32,
    owner: AccountId,
    status: CardStatus,
    print_cycle: u32,
    code_hash: Option<Vec<u8>>,
    minted_at_ms: u64,
    history: Vec<HistoryEntry>,
    history_total: u32,
}

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Series {
    pub id: u32,
    pub creator: AccountId,
    pub name: String,
    /// Published odds of Common, Rare, Epic, Legendary, in basis points.
    pub rates_bps: [u16; 4],
    /// Price of a card of each rarity, in the app's simulated Credits.
    pub prices: [u32; 4],
    pub template_count: u32,
    pub created_at_ms: u64,
}

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Template {
    pub series_id: u32,
    pub template_id: u32,
    pub name: String,
    /// 0 Common, 1 Rare, 2 Epic, 3 Legendary.
    pub rarity: u8,
    pub media: String,
    /// sha256 of the artwork file. Anyone can hash the file and compare.
    pub media_hash: Base64VecU8,
}

/// Everything public about one card.
#[near(serializers = [json])]
pub struct CardView {
    pub token_id: String,
    pub owner_id: AccountId,
    pub series_id: u32,
    pub template_id: u32,
    pub creator: AccountId,
    pub status: CardStatus,
    pub print_cycle: u32,
    pub minted_at_ms: u64,
    /// The most recent entries, at most 32. `history_total` is the true count;
    /// the full record is in the contract's NEP-245 events.
    pub history: Vec<HistoryEntry>,
    pub history_total: u32,
}

#[near(serializers = [json])]
pub struct MtContractMetadata {
    pub spec: String,
    pub name: String,
}

#[near(serializers = [json])]
pub struct MtBaseTokenMetadata {
    pub name: String,
    pub id: String,
    pub symbol: Option<String>,
    pub icon: Option<String>,
    pub decimals: Option<String>,
    pub base_uri: Option<String>,
    pub reference: Option<String>,
    pub copies: Option<u64>,
    pub reference_hash: Option<Base64VecU8>,
}

#[near(serializers = [json])]
pub struct MtTokenMetadata {
    pub title: Option<String>,
    pub description: Option<String>,
    pub media: Option<String>,
    pub media_hash: Option<Base64VecU8>,
    pub issued_at: Option<String>,
    pub expires_at: Option<String>,
    pub starts_at: Option<String>,
    pub updated_at: Option<String>,
    pub extra: Option<String>,
    pub reference: Option<String>,
    pub reference_hash: Option<Base64VecU8>,
}

#[near(serializers = [json])]
pub struct MtTokenMetadataAll {
    pub base: MtBaseTokenMetadata,
    pub token: MtTokenMetadata,
}

/// The NEP-245 token structure, with the metadata extension's fields.
#[near(serializers = [json])]
pub struct Token {
    pub token_id: String,
    pub owner_id: Option<AccountId>,
    pub base_metadata_id: String,
    pub token_metadata: Option<MtTokenMetadata>,
}

#[ext_contract(ext_receiver)]
pub trait MtReceiver {
    fn mt_on_transfer(
        &mut self,
        sender_id: AccountId,
        previous_owner_ids: Vec<AccountId>,
        token_ids: Vec<String>,
        amounts: Vec<U128>,
        msg: String,
    ) -> PromiseOrValue<Vec<U128>>;
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    owner: AccountId,
    minter: AccountId,
    next_series_id: u32,
    next_token_id: u64,
    creators: LookupSet<AccountId>,
    series: LookupMap<u32, Series>,
    templates: LookupMap<u64, Template>,
    cards: LookupMap<u64, Card>,
    owner_cards: LookupMap<AccountId, Vec<u64>>,
}

fn template_key(series_id: u32, template_id: u32) -> u64 {
    ((series_id as u64) << 32) | template_id as u64
}

fn parse_token_id(token_id: &str) -> Option<u64> {
    let id: u64 = token_id.parse().ok()?;
    // One spelling per token: "007" must not be a second name for token 7.
    (id.to_string() == token_id).then_some(id)
}

fn require_token_id(token_id: &str) -> u64 {
    parse_token_id(token_id).unwrap_or_else(|| env::panic_str("Invalid token id"))
}

/// The hash a print lock commits to. Bound to the token and the print cycle, so
/// a code from an earlier cycle, or from another card, can never match.
pub fn redeem_hash(token_id: u64, print_cycle: u32, code: &str) -> Vec<u8> {
    env::sha256(format!("gachard-redeem:{token_id}:{print_cycle}:{code}").as_bytes())
}

fn emit_gachard(event: &str, data: near_sdk::serde_json::Value) {
    env::log_str(&format!(
        "EVENT_JSON:{}",
        json!({"standard": "gachard", "version": "1.0.0", "event": event, "data": [data]})
    ));
}

fn emit_mt_mint(owner: &AccountId, token_ids: &[String], memo: &str) {
    env::log_str(&format!(
        "EVENT_JSON:{}",
        json!({
            "standard": "nep245", "version": "1.0.0", "event": "mt_mint",
            "data": [{
                "owner_id": owner,
                "token_ids": token_ids,
                "amounts": vec!["1"; token_ids.len()],
                "memo": memo,
            }]
        })
    ));
}

fn emit_mt_transfer(from: &AccountId, to: &AccountId, token_ids: &[String], memo: Option<&str>) {
    let mut data = json!({
        "old_owner_id": from,
        "new_owner_id": to,
        "token_ids": token_ids,
        "amounts": vec!["1"; token_ids.len()],
    });
    if let Some(memo) = memo {
        data["memo"] = json!(memo);
    }
    env::log_str(&format!(
        "EVENT_JSON:{}",
        json!({"standard": "nep245", "version": "1.0.0", "event": "mt_transfer", "data": [data]})
    ));
}

impl Card {
    fn record(&mut self, kind: HistoryKind, from: Option<AccountId>, to: AccountId) {
        if self.history.len() >= MAX_HISTORY {
            self.history.remove(0);
        }
        self.history.push(HistoryEntry {
            kind,
            from,
            to,
            block_height: env::block_height(),
            at_ms: env::block_timestamp_ms(),
        });
        self.history_total += 1;
    }
}

impl Contract {
    fn add_to_owner(&mut self, owner: &AccountId, token_id: u64) {
        if let Some(list) = self.owner_cards.get_mut(owner) {
            list.push(token_id);
        } else {
            self.owner_cards.insert(owner.clone(), vec![token_id]);
        }
    }

    fn remove_from_owner(&mut self, owner: &AccountId, token_id: u64) {
        let now_empty = match self.owner_cards.get_mut(owner) {
            Some(list) => {
                list.retain(|id| *id != token_id);
                list.is_empty()
            }
            None => false,
        };
        if now_empty {
            self.owner_cards.remove(owner);
        }
    }

    fn card(&self, token_id: u64) -> &Card {
        self.cards
            .get(&token_id)
            .unwrap_or_else(|| env::panic_str("Card not found"))
    }

    /// Moves a card and records it. Every path that changes a holder ends here.
    fn move_card(&mut self, token_id: u64, to: &AccountId, kind: HistoryKind) -> AccountId {
        let card = self
            .cards
            .get_mut(&token_id)
            .unwrap_or_else(|| env::panic_str("Card not found"));
        let from = card.owner.clone();
        card.owner = to.clone();
        card.record(kind, Some(from.clone()), to.clone());
        if &from != to {
            self.remove_from_owner(&from, token_id);
            self.add_to_owner(to, token_id);
        }
        from
    }

    /// Checks shared by every holder transfer, then moves the cards.
    fn holder_transfer(
        &mut self,
        receiver_id: &AccountId,
        token_ids: &[String],
        amounts: &[U128],
        approvals_given: bool,
        memo: Option<&str>,
    ) -> Vec<AccountId> {
        assert_one_yocto();
        require!(!approvals_given, "Approvals are not supported");
        require!(!token_ids.is_empty(), "No tokens given");
        require!(token_ids.len() <= MAX_BATCH, "Too many tokens in one call");
        require!(
            token_ids.len() == amounts.len(),
            "token_ids and amounts differ in length"
        );
        if let Some(memo) = memo {
            require!(memo.len() <= MAX_MEMO, "Memo too long");
        }
        let sender = env::predecessor_account_id();
        require!(&sender != receiver_id, "Sender and receiver are the same");

        let mut previous = Vec::with_capacity(token_ids.len());
        for (token_id, amount) in token_ids.iter().zip(amounts) {
            require!(amount.0 == 1, "Each card has a supply of 1");
            let id = require_token_id(token_id);
            let card = self.card(id);
            require!(card.owner == sender, "Only the holder can transfer a card");
            require!(
                card.status == CardStatus::Digital,
                "Card is locked for print"
            );
            previous.push(self.move_card(id, receiver_id, HistoryKind::Transfer));
        }
        emit_mt_transfer(&sender, receiver_id, token_ids, memo);
        previous
    }

    fn start_transfer_call(
        &mut self,
        receiver_id: AccountId,
        token_ids: Vec<String>,
        amounts: Vec<U128>,
        previous: Vec<AccountId>,
        msg: String,
    ) -> PromiseOrValue<Vec<U128>> {
        require!(
            env::prepaid_gas() >= GAS_MINIMUM_FOR_CALL,
            "More gas is required"
        );
        ext_receiver::ext(receiver_id.clone())
            .with_static_gas(GAS_ON_TRANSFER)
            .mt_on_transfer(
                env::predecessor_account_id(),
                previous.clone(),
                token_ids.clone(),
                amounts.clone(),
                msg,
            )
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_RESOLVE)
                    .mt_resolve_transfer(previous, receiver_id, token_ids, amounts, None),
            )
            .into()
    }

    /// `unused` is the receiver's answer, or None if its call failed, in which
    /// case every card goes back. A card goes back only if the receiver still
    /// holds it unlocked: it may have moved or printed it during the call.
    fn resolve(
        &mut self,
        previous_owner_ids: Vec<AccountId>,
        receiver_id: AccountId,
        token_ids: Vec<String>,
        unused: Option<Vec<U128>>,
    ) -> Vec<U128> {
        let unused = unused.filter(|v| v.len() == token_ids.len());
        let mut used = Vec::with_capacity(token_ids.len());
        for (i, token_id) in token_ids.iter().enumerate() {
            let wants_refund = unused.as_ref().is_none_or(|v| v[i].0 >= 1);
            let refunded = wants_refund
                && parse_token_id(token_id).is_some_and(|id| {
                    let can_return = self.cards.get(&id).is_some_and(|card| {
                        card.owner == receiver_id && card.status == CardStatus::Digital
                    });
                    if can_return {
                        self.move_card(id, &previous_owner_ids[i], HistoryKind::Transfer);
                        emit_mt_transfer(
                            &receiver_id,
                            &previous_owner_ids[i],
                            std::slice::from_ref(token_id),
                            Some("refund"),
                        );
                    }
                    can_return
                });
            used.push(U128(if refunded { 0 } else { 1 }));
        }
        used
    }

    fn template_of(&self, card: &Card) -> &Template {
        self.templates
            .get(&template_key(card.series_id, card.template_id))
            .unwrap_or_else(|| env::panic_str("Template not found"))
    }

    fn token_metadata(&self, token_id: u64, card: &Card) -> MtTokenMetadata {
        let template = self.template_of(card);
        MtTokenMetadata {
            title: Some(template.name.clone()),
            description: None,
            media: Some(template.media.clone()),
            media_hash: Some(template.media_hash.clone()),
            issued_at: Some(card.minted_at_ms.to_string()),
            expires_at: None,
            starts_at: None,
            updated_at: None,
            extra: Some(
                json!({
                    "token_id": token_id.to_string(),
                    "series_id": card.series_id,
                    "template_id": card.template_id,
                    "rarity": RARITIES[template.rarity as usize],
                    "status": card.status,
                    "print_cycle": card.print_cycle,
                })
                .to_string(),
            ),
            reference: None,
            reference_hash: None,
        }
    }

    fn base_metadata(&self, series_id: u32, template_id: u32) -> Option<MtBaseTokenMetadata> {
        let series = self.series.get(&series_id)?;
        let template = self.templates.get(&template_key(series_id, template_id))?;
        Some(MtBaseTokenMetadata {
            name: format!("{}: {}", series.name, template.name),
            id: format!("{series_id}:{template_id}"),
            symbol: None,
            icon: None,
            decimals: Some("0".to_string()),
            base_uri: None,
            reference: None,
            copies: None,
            reference_hash: None,
        })
    }

    fn to_token(&self, token_id: u64, card: &Card) -> Token {
        Token {
            token_id: token_id.to_string(),
            owner_id: Some(card.owner.clone()),
            base_metadata_id: format!("{}:{}", card.series_id, card.template_id),
            token_metadata: Some(self.token_metadata(token_id, card)),
        }
    }
}

#[near]
impl Contract {
    #[init]
    pub fn new(owner: AccountId, minter: AccountId) -> Self {
        Self {
            owner,
            minter,
            next_series_id: 1,
            next_token_id: 1,
            creators: LookupSet::new(b"c"),
            series: LookupMap::new(b"s"),
            templates: LookupMap::new(b"t"),
            cards: LookupMap::new(b"k"),
            owner_cards: LookupMap::new(b"o"),
        }
    }

    // ---- Platform ----

    pub fn set_minter(&mut self, minter: AccountId) {
        require!(
            env::predecessor_account_id() == self.owner,
            "Only the owner can set the minter"
        );
        self.minter = minter;
    }

    /// Series storage is paid by this contract, so only approved accounts add to it.
    pub fn approve_creator(&mut self, creator: AccountId) {
        let caller = env::predecessor_account_id();
        require!(
            caller == self.owner || caller == self.minter,
            "Only the platform can approve a creator"
        );
        self.creators.insert(creator);
    }

    /// Mints one card per template id, to `receiver_id`.
    pub fn mint(
        &mut self,
        series_id: u32,
        template_ids: Vec<u32>,
        receiver_id: AccountId,
    ) -> Vec<String> {
        require!(
            env::predecessor_account_id() == self.minter,
            "Only the minter can mint"
        );
        require!(!template_ids.is_empty(), "No cards to mint");
        require!(template_ids.len() <= MAX_MINT, "Too many cards in one mint");
        require!(self.series.contains_key(&series_id), "Series not found");

        let mut token_ids = Vec::with_capacity(template_ids.len());
        for template_id in template_ids {
            require!(
                self.templates
                    .contains_key(&template_key(series_id, template_id)),
                "Template not found"
            );
            let id = self.next_token_id;
            self.next_token_id += 1;
            let mut card = Card {
                series_id,
                template_id,
                owner: receiver_id.clone(),
                status: CardStatus::Digital,
                print_cycle: 0,
                code_hash: None,
                minted_at_ms: env::block_timestamp_ms(),
                history: Vec::new(),
                history_total: 0,
            };
            card.record(HistoryKind::Mint, None, receiver_id.clone());
            self.cards.insert(id, card);
            self.add_to_owner(&receiver_id, id);
            token_ids.push(id.to_string());
        }
        emit_mt_mint(&receiver_id, &token_ids, &format!("series:{series_id}"));
        token_ids
    }

    // ---- Creator ----

    /// Called by the creator's own account, so the chain records them as issuer.
    pub fn create_series(&mut self, name: String, rates_bps: [u16; 4], prices: [u32; 4]) -> u32 {
        let creator = env::predecessor_account_id();
        require!(
            self.creators.contains(&creator),
            "This account is not an approved creator"
        );
        require!(
            !name.is_empty() && name.len() <= MAX_NAME,
            "Series name must be 1-64 bytes"
        );
        let total: u32 = rates_bps.iter().map(|r| *r as u32).sum();
        require!(total == RATE_TOTAL_BPS, "Rates must add up to 100%");
        require!(prices.iter().all(|p| *p > 0), "Prices must be above zero");

        let id = self.next_series_id;
        self.next_series_id += 1;
        self.series.insert(
            id,
            Series {
                id,
                creator: creator.clone(),
                name: name.clone(),
                rates_bps,
                prices,
                template_count: 0,
                created_at_ms: env::block_timestamp_ms(),
            },
        );
        emit_gachard(
            "series_created",
            json!({"series_id": id, "creator": creator, "name": name}),
        );
        id
    }

    /// Templates cannot be changed once added, so an art change cannot be silent.
    pub fn add_template(
        &mut self,
        series_id: u32,
        name: String,
        rarity: u8,
        media: String,
        media_hash: Base64VecU8,
    ) -> u32 {
        require!((rarity as usize) < RARITIES.len(), "Invalid rarity");
        require!(
            !name.is_empty() && name.len() <= MAX_NAME,
            "Card name must be 1-64 bytes"
        );
        require!(
            !media.is_empty() && media.len() <= MAX_MEDIA,
            "Media must be 1-256 bytes"
        );
        require!(media_hash.0.len() == 32, "media_hash must be a sha256");

        let series = self
            .series
            .get_mut(&series_id)
            .unwrap_or_else(|| env::panic_str("Series not found"));
        require!(
            series.creator == env::predecessor_account_id(),
            "Only the series creator can add a card"
        );
        require!(
            series.template_count < MAX_TEMPLATES_PER_SERIES,
            "Series is full"
        );
        series.template_count += 1;
        let template_id = series.template_count;

        self.templates.insert(
            template_key(series_id, template_id),
            Template {
                series_id,
                template_id,
                name: name.clone(),
                rarity,
                media,
                media_hash,
            },
        );
        emit_gachard(
            "template_added",
            json!({"series_id": series_id, "template_id": template_id, "name": name, "rarity": RARITIES[rarity as usize]}),
        );
        template_id
    }

    // ---- Holder: NEP-245 transfers ----

    #[payable]
    pub fn mt_transfer(
        &mut self,
        receiver_id: AccountId,
        token_id: String,
        amount: U128,
        approval: Option<(AccountId, u64)>,
        memo: Option<String>,
    ) {
        self.holder_transfer(
            &receiver_id,
            std::slice::from_ref(&token_id),
            &[amount],
            approval.is_some(),
            memo.as_deref(),
        );
    }

    #[payable]
    pub fn mt_batch_transfer(
        &mut self,
        receiver_id: AccountId,
        token_ids: Vec<String>,
        amounts: Vec<U128>,
        approvals: Option<Vec<Option<(AccountId, u64)>>>,
        memo: Option<String>,
    ) {
        self.holder_transfer(
            &receiver_id,
            &token_ids,
            &amounts,
            approvals.is_some(),
            memo.as_deref(),
        );
    }

    #[payable]
    pub fn mt_transfer_call(
        &mut self,
        receiver_id: AccountId,
        token_id: String,
        amount: U128,
        approval: Option<(AccountId, u64)>,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<Vec<U128>> {
        let token_ids = vec![token_id];
        let amounts = vec![amount];
        let previous = self.holder_transfer(
            &receiver_id,
            &token_ids,
            &amounts,
            approval.is_some(),
            memo.as_deref(),
        );
        self.start_transfer_call(receiver_id, token_ids, amounts, previous, msg)
    }

    #[payable]
    pub fn mt_batch_transfer_call(
        &mut self,
        receiver_id: AccountId,
        token_ids: Vec<String>,
        amounts: Vec<U128>,
        approvals: Option<Vec<Option<(AccountId, u64)>>>,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<Vec<U128>> {
        let previous = self.holder_transfer(
            &receiver_id,
            &token_ids,
            &amounts,
            approvals.is_some(),
            memo.as_deref(),
        );
        self.start_transfer_call(receiver_id, token_ids, amounts, previous, msg)
    }

    #[private]
    pub fn mt_resolve_transfer(
        &mut self,
        previous_owner_ids: Vec<AccountId>,
        receiver_id: AccountId,
        token_ids: Vec<String>,
        amounts: Vec<U128>,
        approvals: Option<Vec<Option<Vec<(AccountId, u64)>>>>,
        #[callback_result] unused: Result<Vec<U128>, PromiseError>,
    ) -> Vec<U128> {
        let _ = (amounts, approvals);
        self.resolve(previous_owner_ids, receiver_id, token_ids, unused.ok())
    }

    // ---- Holder: print and redeem ----

    /// Locks the card in place for print. It cannot move until it is redeemed.
    /// `code_hash` is `redeem_hash(token, new print cycle, code)`, made off chain,
    /// so the code itself is never on chain before it is used.
    #[payable]
    pub fn print_lock(&mut self, token_id: String, code_hash: Base64VecU8) -> u32 {
        assert_one_yocto();
        require!(code_hash.0.len() == 32, "code_hash must be a sha256");
        let id = require_token_id(&token_id);
        let caller = env::predecessor_account_id();
        let card = self
            .cards
            .get_mut(&id)
            .unwrap_or_else(|| env::panic_str("Card not found"));
        require!(
            card.owner == caller,
            "Only the holder can print a card"
        );
        require!(
            card.status == CardStatus::Digital,
            "Card is already printed"
        );
        card.status = CardStatus::Printed;
        card.print_cycle += 1;
        card.code_hash = Some(code_hash.0);
        card.record(HistoryKind::Print, Some(caller.clone()), caller.clone());
        let cycle = card.print_cycle;
        emit_gachard(
            "print_lock",
            json!({"token_id": token_id, "holder": caller, "print_cycle": cycle}),
        );
        cycle
    }

    /// Returns a printed card to digital, to the caller, under the same token id.
    /// Holding the code is what entitles them: a physical card changes hands.
    #[payable]
    pub fn redeem(&mut self, token_id: String, code: String) {
        assert_one_yocto();
        require!(
            code.len() >= MIN_CODE && code.len() <= MAX_CODE,
            "Invalid redeem code"
        );
        let id = require_token_id(&token_id);
        let caller = env::predecessor_account_id();
        let card = self
            .cards
            .get_mut(&id)
            .unwrap_or_else(|| env::panic_str("Card not found"));
        require!(card.status == CardStatus::Printed, "Card is not printed");
        let expected = redeem_hash(id, card.print_cycle, &code);
        require!(
            card.code_hash.as_ref() == Some(&expected),
            "Invalid redeem code"
        );
        card.status = CardStatus::Digital;
        card.code_hash = None;
        let cycle = card.print_cycle;
        let from = self.move_card(id, &caller, HistoryKind::Redeem);
        if from != caller {
            emit_mt_transfer(
                &from,
                &caller,
                std::slice::from_ref(&token_id),
                Some("redeem"),
            );
        }
        emit_gachard(
            "redeem",
            json!({"token_id": token_id, "holder": caller, "print_cycle": cycle}),
        );
    }

    // ---- Views: NEP-245 ----

    pub fn mt_token(&self, token_ids: Vec<String>) -> Vec<Option<Token>> {
        token_ids
            .iter()
            .map(|t| {
                let id = parse_token_id(t)?;
                let card = self.cards.get(&id)?;
                Some(self.to_token(id, card))
            })
            .collect()
    }

    pub fn mt_balance_of(&self, account_id: AccountId, token_id: String) -> U128 {
        let held = parse_token_id(&token_id)
            .and_then(|id| self.cards.get(&id))
            .is_some_and(|card| card.owner == account_id);
        U128(held as u128)
    }

    pub fn mt_batch_balance_of(&self, account_id: AccountId, token_ids: Vec<String>) -> Vec<U128> {
        token_ids
            .into_iter()
            .map(|t| self.mt_balance_of(account_id.clone(), t))
            .collect()
    }

    pub fn mt_supply(&self, token_id: String) -> Option<U128> {
        let id = parse_token_id(&token_id)?;
        self.cards.contains_key(&id).then_some(U128(1))
    }

    pub fn mt_batch_supply(&self, token_ids: Vec<String>) -> Vec<Option<U128>> {
        token_ids.into_iter().map(|t| self.mt_supply(t)).collect()
    }

    pub fn mt_tokens_for_owner(
        &self,
        account_id: AccountId,
        from_index: Option<u32>,
        limit: Option<u32>,
    ) -> Vec<Token> {
        let Some(list) = self.owner_cards.get(&account_id) else {
            return Vec::new();
        };
        list.iter()
            .skip(from_index.unwrap_or(0) as usize)
            .take(limit.unwrap_or(50).min(100) as usize)
            .filter_map(|id| self.cards.get(id).map(|card| self.to_token(*id, card)))
            .collect()
    }

    // ---- Views: NEP-245 metadata ----

    pub fn mt_metadata_contract(&self) -> MtContractMetadata {
        MtContractMetadata {
            spec: "mt-1.0.0".to_string(),
            name: "Gachard Cards".to_string(),
        }
    }

    pub fn mt_metadata_token_all(&self, token_ids: Vec<String>) -> Vec<Option<MtTokenMetadataAll>> {
        token_ids
            .iter()
            .map(|t| {
                let id = parse_token_id(t)?;
                let card = self.cards.get(&id)?;
                Some(MtTokenMetadataAll {
                    base: self.base_metadata(card.series_id, card.template_id)?,
                    token: self.token_metadata(id, card),
                })
            })
            .collect()
    }

    pub fn mt_metadata_token_by_token_id(
        &self,
        token_ids: Vec<String>,
    ) -> Vec<Option<MtTokenMetadata>> {
        token_ids
            .iter()
            .map(|t| {
                let id = parse_token_id(t)?;
                let card = self.cards.get(&id)?;
                Some(self.token_metadata(id, card))
            })
            .collect()
    }

    pub fn mt_metadata_base_by_token_id(
        &self,
        token_ids: Vec<String>,
    ) -> Vec<Option<MtBaseTokenMetadata>> {
        token_ids
            .iter()
            .map(|t| {
                let card = self.cards.get(&parse_token_id(t)?)?;
                self.base_metadata(card.series_id, card.template_id)
            })
            .collect()
    }

    /// Metadata ids are "seriesId:templateId".
    pub fn mt_metadata_base_by_metadata_id(
        &self,
        base_metadata_ids: Vec<String>,
    ) -> Vec<Option<MtBaseTokenMetadata>> {
        base_metadata_ids
            .iter()
            .map(|m| {
                let (series, template) = m.split_once(':')?;
                self.base_metadata(series.parse().ok()?, template.parse().ok()?)
            })
            .collect()
    }

    // ---- Views: Gachard ----

    pub fn get_card(&self, token_id: String) -> Option<CardView> {
        let id = parse_token_id(&token_id)?;
        let card = self.cards.get(&id)?;
        let series = self.series.get(&card.series_id)?;
        Some(CardView {
            token_id,
            owner_id: card.owner.clone(),
            series_id: card.series_id,
            template_id: card.template_id,
            creator: series.creator.clone(),
            status: card.status,
            print_cycle: card.print_cycle,
            minted_at_ms: card.minted_at_ms,
            history: card.history.clone(),
            history_total: card.history_total,
        })
    }

    pub fn get_series(&self, series_id: u32) -> Option<Series> {
        self.series.get(&series_id).cloned()
    }

    pub fn get_template(&self, series_id: u32, template_id: u32) -> Option<Template> {
        self.templates
            .get(&template_key(series_id, template_id))
            .cloned()
    }

    pub fn is_creator(&self, account_id: AccountId) -> bool {
        self.creators.contains(&account_id)
    }

    pub fn get_config(&self) -> (AccountId, AccountId, u32, u64) {
        (
            self.owner.clone(),
            self.minter.clone(),
            self.next_series_id - 1,
            self.next_token_id - 1,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::{NearToken, testing_env};

    const CODE: &str = "ABCD-EFGH-JKMN-PQRS";

    fn acc(name: &str) -> AccountId {
        format!("{name}.testnet").parse().unwrap()
    }

    fn as_caller(name: &str, yocto: u128) {
        testing_env!(
            VMContextBuilder::new()
                .current_account_id(acc("contract"))
                .predecessor_account_id(acc(name))
                .attached_deposit(NearToken::from_yoctonear(yocto))
                .prepaid_gas(Gas::from_tgas(300))
                .build()
        );
    }

    fn setup() -> Contract {
        as_caller("platform", 0);
        let mut c = Contract::new(acc("platform"), acc("platform"));
        c.approve_creator(acc("creator"));
        as_caller("creator", 0);
        let s = c.create_series(
            "Dragons".into(),
            [7000, 2000, 800, 200],
            [40, 120, 360, 1200],
        );
        assert_eq!(s, 1);
        c.add_template(
            s,
            "Ember".into(),
            0,
            "cards/ember.webp".into(),
            Base64VecU8(vec![7; 32]),
        );
        c.add_template(
            s,
            "Wyrm".into(),
            3,
            "cards/wyrm.webp".into(),
            Base64VecU8(vec![9; 32]),
        );
        as_caller("platform", 0);
        c
    }

    fn mint_one(c: &mut Contract, to: &str) -> String {
        as_caller("platform", 0);
        c.mint(1, vec![1], acc(to)).remove(0)
    }

    fn lock(c: &mut Contract, holder: &str, token: &str, code: &str) {
        let id = token.parse().unwrap();
        let cycle = c.card(id).print_cycle + 1;
        as_caller(holder, 1);
        c.print_lock(token.into(), Base64VecU8(redeem_hash(id, cycle, code)));
    }

    // ---- Who may do what ----

    #[test]
    #[should_panic(expected = "Only the platform can approve")]
    fn stranger_cannot_approve_a_creator() {
        let mut c = setup();
        as_caller("mallory", 0);
        c.approve_creator(acc("mallory"));
    }

    #[test]
    #[should_panic(expected = "not an approved creator")]
    fn unapproved_account_cannot_create_a_series() {
        let mut c = setup();
        as_caller("mallory", 0);
        c.create_series("Fake".into(), [10000, 0, 0, 0], [1, 1, 1, 1]);
    }

    #[test]
    #[should_panic(expected = "Only the series creator")]
    fn another_creator_cannot_add_to_a_series() {
        let mut c = setup();
        c.approve_creator(acc("rival"));
        as_caller("rival", 0);
        c.add_template(1, "X".into(), 0, "x".into(), Base64VecU8(vec![1; 32]));
    }

    #[test]
    #[should_panic(expected = "Only the minter")]
    fn creator_cannot_mint() {
        let mut c = setup();
        as_caller("creator", 0);
        c.mint(1, vec![1], acc("creator"));
    }

    #[test]
    #[should_panic(expected = "Only the holder can transfer")]
    fn platform_cannot_move_a_card_it_minted() {
        let mut c = setup();
        let t = mint_one(&mut c, "alice");
        as_caller("platform", 1);
        c.mt_transfer(acc("carol"), t, U128(1), None, None);
    }

    #[test]
    #[should_panic(expected = "Only the holder can print")]
    fn platform_cannot_print_someone_elses_card() {
        let mut c = setup();
        let t = mint_one(&mut c, "alice");
        as_caller("platform", 1);
        c.print_lock(t, Base64VecU8(vec![1; 32]));
    }

    // ---- Series and templates ----

    #[test]
    fn origin_is_readable_from_a_token() {
        let mut c = setup();
        let t = mint_one(&mut c, "alice");
        let v = c.get_card(t).unwrap();
        assert_eq!(v.creator, acc("creator"));
        assert_eq!((v.series_id, v.template_id), (1, 1));
        assert_eq!(v.status, CardStatus::Digital);
        assert_eq!(
            c.get_series(1).unwrap().rates_bps,
            [7000, 2000, 800, 200]
        );
        assert_eq!(c.get_template(1, 2).unwrap().media_hash.0, vec![9; 32]);
    }

    #[test]
    #[should_panic(expected = "Rates must add up")]
    fn rates_must_add_up() {
        let mut c = setup();
        as_caller("creator", 0);
        c.create_series("Bad".into(), [5000, 2000, 800, 200], [1, 1, 1, 1]);
    }

    #[test]
    #[should_panic(expected = "media_hash must be a sha256")]
    fn media_hash_must_be_32_bytes() {
        let mut c = setup();
        as_caller("creator", 0);
        c.add_template(1, "X".into(), 0, "x".into(), Base64VecU8(vec![1; 5]));
    }

    #[test]
    #[should_panic(expected = "Invalid rarity")]
    fn rarity_must_exist() {
        let mut c = setup();
        as_caller("creator", 0);
        c.add_template(1, "X".into(), 4, "x".into(), Base64VecU8(vec![1; 32]));
    }

    #[test]
    #[should_panic(expected = "Template not found")]
    fn mint_needs_an_existing_template() {
        let mut c = setup();
        c.mint(1, vec![99], acc("alice"));
    }

    #[test]
    fn mint_gives_each_card_its_own_token() {
        let mut c = setup();
        let ids = c.mint(1, vec![1, 2, 1], acc("alice"));
        assert_eq!(ids, vec!["1", "2", "3"]);
        assert_eq!(c.mt_supply("2".into()), Some(U128(1)));
        assert_eq!(c.mt_supply("4".into()), None);
        assert_eq!(c.mt_tokens_for_owner(acc("alice"), None, None).len(), 3);
    }

    // ---- NEP-245 transfer ----

    #[test]
    fn holder_transfer_moves_card_and_history() {
        let mut c = setup();
        let t = mint_one(&mut c, "alice");
        as_caller("alice", 1);
        c.mt_transfer(acc("bob"), t.clone(), U128(1), None, None);
        assert_eq!(c.mt_balance_of(acc("alice"), t.clone()), U128(0));
        assert_eq!(c.mt_balance_of(acc("bob"), t.clone()), U128(1));
        assert!(c.mt_tokens_for_owner(acc("alice"), None, None).is_empty());
        assert_eq!(c.mt_tokens_for_owner(acc("bob"), None, None).len(), 1);
        let v = c.get_card(t).unwrap();
        assert_eq!(v.history_total, 2);
        assert_eq!(v.history[1].kind, HistoryKind::Transfer);
        assert_eq!(v.history[1].from, Some(acc("alice")));
        assert_eq!(v.history[1].to, acc("bob"));
    }

    #[test]
    #[should_panic(expected = "exactly 1 yoctoNEAR")]
    fn transfer_requires_one_yocto() {
        let mut c = setup();
        let t = mint_one(&mut c, "alice");
        as_caller("alice", 0);
        c.mt_transfer(acc("bob"), t, U128(1), None, None);
    }

    #[test]
    #[should_panic(expected = "supply of 1")]
    fn transfer_amount_must_be_one() {
        let mut c = setup();
        let t = mint_one(&mut c, "alice");
        as_caller("alice", 1);
        c.mt_transfer(acc("bob"), t, U128(2), None, None);
    }

    #[test]
    #[should_panic(expected = "Approvals are not supported")]
    fn approvals_are_refused() {
        let mut c = setup();
        let t = mint_one(&mut c, "alice");
        as_caller("alice", 1);
        c.mt_transfer(acc("bob"), t, U128(1), Some((acc("alice"), 1)), None);
    }

    #[test]
    #[should_panic(expected = "Invalid token id")]
    fn token_id_has_one_spelling() {
        let mut c = setup();
        mint_one(&mut c, "alice");
        as_caller("alice", 1);
        c.mt_transfer(acc("bob"), "01".into(), U128(1), None, None);
    }

    #[test]
    fn batch_transfer_moves_all() {
        let mut c = setup();
        let ids = c.mint(1, vec![1, 2], acc("alice"));
        as_caller("alice", 1);
        c.mt_batch_transfer(acc("bob"), ids.clone(), vec![U128(1), U128(1)], None, None);
        assert_eq!(
            c.mt_batch_balance_of(acc("bob"), ids),
            vec![U128(1), U128(1)]
        );
    }

    #[test]
    #[should_panic(expected = "Only the holder can transfer")]
    fn batch_with_one_foreign_card_fails() {
        let mut c = setup();
        let mine = mint_one(&mut c, "alice");
        let theirs = mint_one(&mut c, "bob");
        as_caller("alice", 1);
        c.mt_batch_transfer(
            acc("carol"),
            vec![mine, theirs],
            vec![U128(1), U128(1)],
            None,
            None,
        );
    }

    // ---- Transfer and call: the receiver's answer ----

    #[test]
    fn failed_receiver_call_returns_the_card() {
        let mut c = setup();
        let t = mint_one(&mut c, "alice");
        as_caller("alice", 1);
        c.mt_transfer(acc("market"), t.clone(), U128(1), None, None);
        let used = c.resolve(vec![acc("alice")], acc("market"), vec![t.clone()], None);
        assert_eq!(used, vec![U128(0)]);
        assert_eq!(c.mt_balance_of(acc("alice"), t), U128(1));
    }

    #[test]
    fn receiver_keeping_the_card_keeps_it() {
        let mut c = setup();
        let t = mint_one(&mut c, "alice");
        as_caller("alice", 1);
        c.mt_transfer(acc("market"), t.clone(), U128(1), None, None);
        let used = c.resolve(
            vec![acc("alice")],
            acc("market"),
            vec![t.clone()],
            Some(vec![U128(0)]),
        );
        assert_eq!(used, vec![U128(1)]);
        assert_eq!(c.mt_balance_of(acc("market"), t), U128(1));
    }

    #[test]
    fn card_printed_during_the_call_does_not_go_back() {
        let mut c = setup();
        let t = mint_one(&mut c, "alice");
        as_caller("alice", 1);
        c.mt_transfer(acc("market"), t.clone(), U128(1), None, None);
        lock(&mut c, "market", &t, CODE);
        let used = c.resolve(
            vec![acc("alice")],
            acc("market"),
            vec![t.clone()],
            Some(vec![U128(1)]),
        );
        assert_eq!(used, vec![U128(1)]);
        assert_eq!(c.mt_balance_of(acc("market"), t), U128(1));
    }

    // ---- Print and redeem ----

    #[test]
    #[should_panic(expected = "locked for print")]
    fn printed_card_cannot_move() {
        let mut c = setup();
        let t = mint_one(&mut c, "alice");
        lock(&mut c, "alice", &t, CODE);
        as_caller("alice", 1);
        c.mt_transfer(acc("bob"), t, U128(1), None, None);
    }

    #[test]
    #[should_panic(expected = "already printed")]
    fn card_cannot_be_printed_twice_at_once() {
        let mut c = setup();
        let t = mint_one(&mut c, "alice");
        lock(&mut c, "alice", &t, CODE);
        lock(&mut c, "alice", &t, CODE);
    }

    #[test]
    fn redeem_returns_the_same_token_to_whoever_holds_the_code() {
        let mut c = setup();
        let t = mint_one(&mut c, "alice");
        lock(&mut c, "alice", &t, CODE);
        assert_eq!(c.get_card(t.clone()).unwrap().status, CardStatus::Printed);
        // Printed in place: alice still holds it until the code is used.
        assert_eq!(c.mt_balance_of(acc("alice"), t.clone()), U128(1));

        as_caller("bob", 1);
        c.redeem(t.clone(), CODE.into());

        let v = c.get_card(t.clone()).unwrap();
        assert_eq!(v.token_id, t);
        assert_eq!(v.status, CardStatus::Digital);
        assert_eq!(v.owner_id, acc("bob"));
        assert_eq!(v.print_cycle, 1);
        let kinds: Vec<_> = v.history.iter().map(|h| h.kind).collect();
        assert_eq!(
            kinds,
            vec![HistoryKind::Mint, HistoryKind::Print, HistoryKind::Redeem]
        );
        assert_eq!(c.mt_balance_of(acc("alice"), t.clone()), U128(0));
        assert_eq!(c.mt_balance_of(acc("bob"), t), U128(1));
    }

    #[test]
    #[should_panic(expected = "Invalid redeem code")]
    fn wrong_code_is_refused() {
        let mut c = setup();
        let t = mint_one(&mut c, "alice");
        lock(&mut c, "alice", &t, CODE);
        as_caller("bob", 1);
        c.redeem(t, "WRONG-WRONG-WRONG-1".into());
    }

    /// The v1 flaw (ADR-036): passing the stored hash back as if it were the code.
    #[test]
    #[should_panic(expected = "Invalid redeem code")]
    fn stored_hash_is_not_a_code() {
        let mut c = setup();
        let t = mint_one(&mut c, "alice");
        lock(&mut c, "alice", &t, CODE);
        let id: u64 = t.parse().unwrap();
        let stored: String = c
            .card(id)
            .code_hash
            .clone()
            .unwrap()
            .iter()
            .take(30)
            .map(|b| format!("{b:02x}"))
            .collect();
        as_caller("mallory", 1);
        c.redeem(t, stored);
    }

    #[test]
    #[should_panic(expected = "Card is not printed")]
    fn code_cannot_be_used_twice() {
        let mut c = setup();
        let t = mint_one(&mut c, "alice");
        lock(&mut c, "alice", &t, CODE);
        as_caller("bob", 1);
        c.redeem(t.clone(), CODE.into());
        as_caller("carol", 1);
        c.redeem(t, CODE.into());
    }

    #[test]
    #[should_panic(expected = "Invalid redeem code")]
    fn code_from_an_earlier_print_cycle_is_dead() {
        let mut c = setup();
        let t = mint_one(&mut c, "alice");
        lock(&mut c, "alice", &t, CODE);
        as_caller("alice", 1);
        c.redeem(t.clone(), CODE.into());
        lock(&mut c, "alice", &t, "NEWC-ODEN-EWCO-DE22");
        as_caller("mallory", 1);
        c.redeem(t, CODE.into());
    }

    #[test]
    #[should_panic(expected = "Invalid redeem code")]
    fn code_of_another_card_is_refused() {
        let mut c = setup();
        let a = mint_one(&mut c, "alice");
        let b = mint_one(&mut c, "alice");
        lock(&mut c, "alice", &a, CODE);
        lock(&mut c, "alice", &b, "OTHE-RCOD-EOTH-ER22");
        as_caller("mallory", 1);
        c.redeem(b, CODE.into());
    }

    #[test]
    #[should_panic(expected = "exactly 1 yoctoNEAR")]
    fn print_lock_requires_one_yocto() {
        let mut c = setup();
        let t = mint_one(&mut c, "alice");
        as_caller("alice", 0);
        c.print_lock(t, Base64VecU8(vec![1; 32]));
    }

    // ---- History and metadata ----

    #[test]
    fn history_is_capped_but_counted() {
        let mut c = setup();
        let t = mint_one(&mut c, "alice");
        for _ in 0..20 {
            as_caller("alice", 1);
            c.mt_transfer(acc("bob"), t.clone(), U128(1), None, None);
            as_caller("bob", 1);
            c.mt_transfer(acc("alice"), t.clone(), U128(1), None, None);
        }
        let v = c.get_card(t).unwrap();
        assert_eq!(v.history.len(), MAX_HISTORY);
        assert_eq!(v.history_total, 41);
        assert_eq!(v.history[0].kind, HistoryKind::Transfer);
        assert_eq!(c.mt_tokens_for_owner(acc("alice"), None, None).len(), 1);
    }

    #[test]
    fn metadata_names_the_card_and_its_art() {
        let mut c = setup();
        let t = c.mint(1, vec![2], acc("alice")).remove(0);
        let all = c.mt_metadata_token_all(vec![t.clone(), "99".into()]);
        let first = all[0].as_ref().unwrap();
        assert!(all[1].is_none());
        assert_eq!(first.base.id, "1:2");
        assert_eq!(first.base.name, "Dragons: Wyrm");
        assert_eq!(first.token.title.as_deref(), Some("Wyrm"));
        assert!(first.token.extra.as_ref().unwrap().contains("Legendary"));
        assert_eq!(c.mt_token(vec![t])[0].as_ref().unwrap().base_metadata_id, "1:2");
        assert_eq!(c.mt_metadata_contract().spec, "mt-1.0.0");
    }
}

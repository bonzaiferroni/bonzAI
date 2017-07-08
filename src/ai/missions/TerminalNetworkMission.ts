import {Mission, MissionMemory} from "./Mission";
import {Operation} from "../operations/Operation";
import {
    MINERALS_RAW, NEED_ENERGY_THRESHOLD, RESERVE_AMOUNT, SUPPLY_ENERGY_THRESHOLD, SURPLUS_AMOUNT,
} from "../TradeNetwork";
import {MINERAL_STORAGE_TARGET} from "../../config/constants";
import {empire} from "../Empire";
import {helper} from "../../helpers/helper";
import {Scheduler} from "../../Scheduler";
import {Notifier} from "../../notifier";

interface TerminalNetworkMemory extends MissionMemory {
    nextOverstockCheck: number;
    nextSellOverstock: number;
    emptyRoom: number;
}

export class TerminalNetworkMission extends Mission {

    private terminal: StructureTerminal;
    private storage: StructureStorage;
    public memory: TerminalNetworkMemory;

    constructor(operation: Operation) {
        super(operation, "network");
    }

    public init() {}

    public update() {
        this.terminal = this.room.terminal;
        this.storage = this.room.storage;
    }

    public roleCall() {
    }

    public actions() {
        this.sellOverstock();
        this.checkOverstock();
        this.checkEnergy();
        this.emptyRoom();
        // empire.network.registerRoom(this.room);
    }

    public finalize() {
    }

    public invalidateCache() {
    }

    private sellOverstock() {
        if (Scheduler.delay(this.memory, "sellOverstock", 100)) { return; }

        for (let mineralType of MINERALS_RAW) {
            if (this.storage.store[mineralType] >= MINERAL_STORAGE_TARGET[mineralType]
                && this.storage.room.terminal.store[mineralType] >= RESERVE_AMOUNT) {
                console.log("TRADE: have too much", mineralType, "in", this.storage.room,
                    this.storage.store[mineralType]);
                empire.market.sellExcess(this.room, mineralType, RESERVE_AMOUNT);
            }
        }

        if (_.sum(this.storage.store) >= 940000) {
            console.log("TRADE: have too much energy in", this.storage.room, this.storage.store.energy);
            empire.market.sellExcess(this.room, RESOURCE_ENERGY, RESERVE_AMOUNT);
        }
    }

    private checkOverstock() {
        if (_.sum(this.terminal.store) < 250000) { return; }
        if (Scheduler.delay(this.memory, "checkOverstock", 20)) { return; }

        let mostStockedAmount = 0;
        let mostStockedResource: string;
        for (let resourceType in this.terminal.store) {
            if (resourceType === RESOURCE_ENERGY) { continue; }
            if (this.terminal.store[resourceType] < mostStockedAmount) { continue; }
            mostStockedAmount = this.terminal.store[resourceType];
            mostStockedResource = resourceType;
        }

        let leastStockedTerminal = _(empire.network.terminals)
            .filter(x => !x.room.controller.sign || x.room.controller.sign.text !== "noTrade")
            .min(x => _.sum(x.store));
        if (!_.isObject(leastStockedTerminal)) {
            return;
        }
        this.terminal.send(mostStockedResource, RESERVE_AMOUNT, leastStockedTerminal.room.name);
        console.log("NETWORK: balancing terminal capacity, sending", RESERVE_AMOUNT, mostStockedResource,
            "from", this.room.name, "to", leastStockedTerminal.room.name);
    }

    private checkEnergy() {
        if (this.room.storage.store.energy > NEED_ENERGY_THRESHOLD - 100000) {
            return;
        }

        if (Scheduler.delay(this.memory, "checkEnergy", 1000)) {
            return;
        }

        let order = _.filter(Game.market.orders,
            x => x.roomName === this.roomName && x.resourceType === "energy" && x.type === ORDER_BUY)[0];

        if (order) {
            if (order.remainingAmount < 1000) {
                Game.market.cancelOrder(order.id);
            } else {
                return;
            }
        }

        Game.market.createOrder(ORDER_BUY, "energy", .012, 100000, this.roomName);
        Notifier.log(`NETWORK: Creating energy buy order in ${this.roomName}`);
    }

    private emptyRoom() {
        if (!this.memory.emptyRoom) { return; }
        if (!this.room.controller.sign || this.room.controller.sign.text !== "noTrade") {
            let signer = this.headCount("signer", () => [MOVE], () => 1)[0];
            if (!signer) { return; }
            let outcome = signer.creep.signController(this.room.controller, "noTrade");
            if (outcome === ERR_NOT_IN_RANGE) {
                signer.travelTo(this.room.controller);
            }
            return;
        }

        empire.network.emptyTerminal(this.roomName);
    }
}

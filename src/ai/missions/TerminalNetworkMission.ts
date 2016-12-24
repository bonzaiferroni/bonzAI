import {Mission} from "./Mission";
import {Operation} from "../operations/Operation";
import {
    SUPPLY_SWAP_THRESHOLD, SUPPLY_ENERGY_THRESHOLD, NEED_ENERGY_THRESHOLD,
    RESERVE_AMOUNT, TRADE_RESOURCES, MINERALS_RAW,
    MINERAL_STORAGE_TARGET, TRADE_PARTNERS, TRADE_MAX_DISTANCE, TRADE_ENERGY_AMOUNT,
} from "../../config/constants";
import {helper} from "../../helpers/helper";
export class TerminalNetworkMission extends Mission {

    terminal: StructureTerminal;
    storage: StructureStorage;

    constructor(operation: Operation) {
        super(operation, "network");
    }

    initMission() {
        this.terminal = this.room.terminal;
        this.storage = this.room.storage;
    }

    roleCall() {
    }

    missionActions() {
        this.sellOverstock();
        this.checkOverstock();
    }

    finalizeMission() {
    }

    invalidateMissionCache() {
    }

    private sellOverstock() {

        if (Game.time % 100 !== 1) return;

        for (let mineralType of MINERALS_RAW) {
            if (this.storage.store[mineralType] >= MINERAL_STORAGE_TARGET[mineralType]
                && this.storage.room.terminal.store[mineralType] >= RESERVE_AMOUNT) {
                console.log("TRADE: have too much", mineralType, "in", this.storage.room, this.storage.store[mineralType]);
                this.empire.sellExcess(this.room, mineralType, RESERVE_AMOUNT);
            }
        }

        if (_.sum(this.storage.store) >= 940000) {
            console.log("TRADE: have too much energy in", this.storage.room, this.storage.store.energy);
            this.empire.sellExcess(this.room, RESOURCE_ENERGY, RESERVE_AMOUNT);
        }
    }

    private checkOverstock() {
        if (Game.time % 100 !== 0 || _.sum(this.terminal.store) < 250000) return;

        let mostStockedAmount = 0;
        let mostStockedResource: string;
        for (let resourceType in this.terminal.store) {
            if (resourceType === RESOURCE_ENERGY) continue;
            if (this.terminal.store[resourceType] < mostStockedAmount) continue;
            mostStockedAmount = this.terminal.store[resourceType];
            mostStockedResource = resourceType;
        }

        let leastStockedTerminal = _.sortBy(this.empire.terminals, (t: StructureTerminal) => _.sum(t.store))[0];
        this.terminal.send(mostStockedResource, RESERVE_AMOUNT, leastStockedTerminal.room.name);
        console.log("NETWORK: balancing terminal capacity, sending", RESERVE_AMOUNT, mostStockedResource,
            "from", this.room.name, "to", leastStockedTerminal.room.name);
    }
}
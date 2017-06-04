import {Mission, MissionMemory, MissionState} from "./Mission";
import {Operation} from "../operations/Operation";
import {TransportAnalysis} from "../../interfaces";
import {helper} from "../../helpers/helper";
import {RESERVE_AMOUNT, NEED_ENERGY_THRESHOLD, SUPPLY_ENERGY_THRESHOLD} from "../TradeNetwork";
import {Agent} from "../agents/Agent";
import {PathMission} from "./PathMission";
import {empire} from "../Empire";
import {RoomHelper} from "../RoomHelper";
import {MemHelper} from "../../helpers/MemHelper";
import {Profiler} from "../../Profiler";

interface UpgradeMemory extends MissionMemory {
    batteryPosition: RoomPosition;
    cartCount: number;
    positionCount: number;
    roadRepairIds: string[];
    transportAnalysis: TransportAnalysis;
    max: number;
    upgPositions: string;
    batteryId: string;
    potency: number;
}

interface UpgradeState extends MissionState {
    remoteSpawning: boolean;
    battery: StoreStructure;
    potencyPerCreep: number;
    distanceToSpawn: number;
}

export class UpgradeMission extends Mission {

    private linkUpgraders: Agent[];
    private batterySupplyCarts: Agent[];
    private influxCarts: Agent[];
    private batteryId: string;
    private boost: boolean;
    private upgraderPositions: RoomPosition[];
    private pathMission: PathMission;

    public memory: UpgradeMemory;
    public state: UpgradeState;

    /**
     * Controller upgrading. Will look for a suitable controller battery (StructureContainer, StructureStorage,
     * StructureLink) and if one isn't found it will spawn SupplyMission to bring energy to upgraders
     * @param operation
     * @param boost
     * @param allowSpawn
     * @param allowUnboosted
     */

    constructor(operation: Operation, boost: boolean, allowSpawn = true, allowUnboosted = true) {
        super(operation, "upgrade", allowSpawn);
        this.boost = boost;
    }

    public init() {
        if (!this.memory.cartCount) { this.memory.cartCount = 0; }

        let battery = this.findControllerBattery();
        if (battery) {
            this.batteryId = battery.id;
        }

        this.upgraderPositions = this.findUpgraderPositions();
        this.pathMission = new PathMission(this.operation, this.name + "Path");
        this.operation.addMissionLate(this.pathMission);
    }

    public update() {
        // Profiler.end("focus", );
        // Profiler.start("focus", true, 3);
        this.state.distanceToSpawn = this.findDistanceToSpawn();
        this.state.battery = Game.getObjectById<StoreStructure>(this.batteryId);
        this.updatePathMission();
    }

    private linkUpgraderBody = () => {

        if (this.memory.max !== undefined) {
            return this.workerBody(30, 4, 15);
        }

        if (this.state.remoteSpawning) {
            return this.workerBody(this.potencyPerCreep, 4, this.potencyPerCreep);
        }

        if (this.spawnGroup.maxSpawnEnergy < 800) {
            return this.bodyRatio(2, 1, 1, 1);
        } else {
            return this.workerBody(this.potencyPerCreep, 4, Math.ceil(this.potencyPerCreep / 2));
        }
    };

    private getMax = (): number => {
        return this.findMaxUpgraders(this.totalPotency, this.potencyPerCreep);
    };

    public roleCall() {

        let max = this.getMax();
        if (this.room.controller.level === 8 && max > 1) {
            console.log(`upgrader count error: ${max}, ${this.operation.name}`);
            console.log(`${this.room}, ${this.spawnGroup.room}`);
            console.log(`${this.totalPotency}, ${this.potencyPerCreep}, ${this.spawnGroup.maxSpawnEnergy}, ${
                this.state.remoteSpawning}, ${this.state.potencyPerCreep}`);
        }
        // memory
        let memory;
        if (this.boost) { // || empire.network.hasAbundance(RESOURCE_CATALYZED_GHODIUM_ACID)
            memory = {boosts: [RESOURCE_CATALYZED_GHODIUM_ACID], allowUnboosted: true};
        }

        if (this.state.battery instanceof StructureContainer) {
            let analysis = this.cacheTransportAnalysis(25, this.totalPotency);
            this.batterySupplyCarts = this.headCount("upgraderCart",
                () => this.workerBody(0, analysis.carryCount, analysis.moveCount),
                () => Math.min(analysis.cartsNeeded, 3), { prespawn: this.state.distanceToSpawn });
        }

        this.linkUpgraders = this.headCount("upgrader", this.linkUpgraderBody, this.getMax, {
            prespawn: this.state.distanceToSpawn,
            memory: memory,
        } );

        let maxInfluxCarts = 0;
        let influxMemory;
        if (this.state.remoteSpawning) {
            if (this.room.storage && this.room.storage.store.energy < NEED_ENERGY_THRESHOLD
                && this.spawnGroup.room.storage
                && this.spawnGroup.room.storage.store.energy > SUPPLY_ENERGY_THRESHOLD) {
                maxInfluxCarts = 10;
                influxMemory = { originId: this.spawnGroup.room.storage.id };
            }
        }
        let influxCartBody = () => this.workerBody(0, 25, 25);
        this.influxCarts = this.headCount("influxCart", influxCartBody, () => maxInfluxCarts,
            { memory: influxMemory, skipMoveToRoom: true });
    }

    public actions() {
        let index = 0;
        for (let upgrader of this.linkUpgraders) {
            this.linkUpgraderActions(upgrader, index);
            index++;
        }

        if (this.batterySupplyCarts) {
            for (let cart of this.batterySupplyCarts) {
                this.batterySupplyCartActions(cart);
            }
        }

        for (let influxCart of this.influxCarts) {
            this.influxCartActions(influxCart);
        }
    }

    public finalize() {
    }

    public invalidateCache() {
        if (Math.random() < .01) { this.memory.positionCount = undefined; }
        if (Math.random() < .1) { this.memory.transportAnalysis = undefined; }
        this.memory.upgPositions = undefined;
    }

    private linkUpgraderActions(upgrader: Agent, index: number) {

        if (!this.state.battery) {
            upgrader.idleOffRoad(this.flag);
            return; // early
        }

        if (this.state.battery instanceof StructureContainer
            && this.state.battery.hits < this.state.battery.hitsMax * 0.8) {
            upgrader.repair(this.state.battery);
        } else {
            upgrader.upgradeController(this.room.controller);
        }
        let myPosition = this.findUpgraderPositions()[index];
        if (myPosition) {
            let range = upgrader.pos.getRangeTo(myPosition);
            if (range > 0) {
                upgrader.travelTo(myPosition, {range: 0});
            }
        } else {
            if (upgrader.pos.inRangeTo(this.state.battery, 3)) {
                upgrader.yieldRoad(this.state.battery);
            } else {
                upgrader.travelTo(this.state.battery);
            }
        }

        if (upgrader.carry[RESOURCE_ENERGY] < upgrader.carryCapacity / 4) {
            upgrader.withdraw(this.state.battery, RESOURCE_ENERGY);
        }
    }

    private findControllerBattery() {
        let battery = this.getBattery();

        if (battery instanceof StructureContainer && this.room.controller.level >= 5) {
            battery.destroy();
            return;
        }

        if (battery instanceof StructureLink && this.room.controller.level < 5) {
            battery.destroy();
            return;
        }

        if (!battery) {
            if (this.room.hostiles.length > 0) { return; }
            let spawn = this.room.find<StructureSpawn>(FIND_MY_SPAWNS)[0];
            if (!spawn) { return; }
            if (!this.memory.batteryPosition) {
                this.memory.batteryPosition = this.findBatteryPosition(spawn);
                if (!this.memory.batteryPosition) { return; }
            }
            let structureType = STRUCTURE_LINK;
            if (this.room.controller.level < 5) {
                structureType = STRUCTURE_CONTAINER;
            }
            let position = helper.deserializeRoomPosition(this.memory.batteryPosition);
            if (position.lookFor(LOOK_CONSTRUCTION_SITES).length > 0) { return; }
            let outcome = position.createConstructionSite(structureType);
            console.log(`UPGRADE: placing battery in ${this.operation.name}, outcome: ${outcome}, ${position}`);
        }

        return battery;
    }

    private findBatteryPosition(spawn: StructureSpawn): RoomPosition {
        let ret = empire.traveler.findTravelPath(spawn.pos, this.room.controller.pos);
        let positionsInRange = this.room.controller.pos.findInRange(ret.path, 3);
        positionsInRange = _.sortBy(positionsInRange, (pos: RoomPosition) => pos.getRangeTo(spawn.pos));

        let mostSpots = 0;
        let bestPositionSoFar;
        for (let position of positionsInRange) {
            let sourcesInRange = position.findInRange(FIND_SOURCES, 2);
            if (sourcesInRange.length > 0) { continue; }
            let openSpotCount = _.filter(position.openAdjacentSpots(true),
                (pos: RoomPosition) => pos.getRangeTo(this.room.controller) <= 3).length;
            if (openSpotCount >= 5) {
                return position;
            } else if (openSpotCount > mostSpots) {
                mostSpots = openSpotCount;
                bestPositionSoFar = position;
            }
        }

        if (bestPositionSoFar) {
            return bestPositionSoFar;
        } else {
            console.log(`couldn't find controller battery position in ${this.operation.name}`);
        }
    }

    private batterySupplyCartActions(cart: Agent) {
        let controllerBattery = this.state.battery as StructureContainer;
        let hasLoad = cart.hasLoad();
        if (!hasLoad) {
            cart.procureEnergy(controllerBattery);
            return;
        }

        let rangeToBattery = cart.pos.getRangeTo(controllerBattery);
        if (rangeToBattery > 3) {
            cart.travelTo(controllerBattery);
            return;
        }

        if (controllerBattery.store.energy === controllerBattery.storeCapacity) {
            cart.yieldRoad(controllerBattery);
            return;
        }

        if (rangeToBattery > 1) {
            cart.travelTo(controllerBattery);
            return;
        }

        cart.transfer(controllerBattery, RESOURCE_ENERGY);
    }

    private influxCartActions(influxCart: Agent) {

        let originStorage = Game.getObjectById<StructureStorage>(influxCart.memory.originId);
        if (!originStorage) {
            influxCart.idleOffRoad(this.flag);
            return;
        }

        let hasLoad = influxCart.hasLoad();
        if (!hasLoad) {
            if (influxCart.pos.isNearTo(originStorage)) {
                influxCart.withdraw(originStorage, RESOURCE_ENERGY);
                influxCart.travelTo(this.room.storage, {ignoreRoads: true});
            } else {
                influxCart.travelTo(originStorage, {ignoreRoads: true});
            }
            return;
        }

        if (influxCart.pos.isNearTo(this.room.storage)) {
            influxCart.transfer(this.room.storage, RESOURCE_ENERGY);
            influxCart.travelTo(originStorage, {ignoreRoads: true});
        } else {
            influxCart.travelTo(this.room.storage, {ignoreRoads: true});
        }
    }

    private findMaxUpgraders(totalPotency: number, potencyPerCreep: number): number {
        if (!this.state.battery) { return 0; }

        if (this.memory.max !== undefined) {
            console.log(`overriding max in ${this.operation.name}`);
            return this.memory.max;
        }

        let max = Math.min(Math.ceil(totalPotency / potencyPerCreep), 5);
        if (this.findUpgraderPositions()) {
            max = Math.min(this.findUpgraderPositions().length, max);
        }

        return max;
    }

    get potencyPerCreep(): number {
        if (!this.state.potencyPerCreep) {
            let potencyPerCreep;
            if (this.state.remoteSpawning) {
                potencyPerCreep = Math.min(this.totalPotency, 23);
            } else {
                let unitCost = 125;
                let maxLocalPotency = Math.floor((this.spawnGroup.maxSpawnEnergy - 200) / unitCost);
                potencyPerCreep = Math.min(maxLocalPotency, 30, this.totalPotency);
            }
            this.state.potencyPerCreep = potencyPerCreep;
        }
        return this.state.potencyPerCreep;
    }

    get totalPotency(): number {
        if (!this.state.battery || this.room.hostiles.length > 0) { return 0; }

        if (this.memory.potency !== undefined) {
            // manual override
            return this.memory.potency;
        }

        if (this.room.controller.level === 8) {
            // cpu saving mechanism
            if (this.room.controller.ticksToDowngrade > 100000 && !empire.underCPULimit()) {
                return 0;
            }
            if (this.room.storage && this.room.storage.store.energy > NEED_ENERGY_THRESHOLD) {
                return 15;
            } else {
                return 1;
            }
        }

        // less upgraders while builders are active
        if (this.room.find(FIND_MY_CONSTRUCTION_SITES).length > 0 &&
            (!this.room.storage || this.room.storage.store.energy < 50000)) {
            return 1;
        }

        let storageCapacity;
        if (this.room.storage) {
            storageCapacity = Math.floor(this.room.storage.store.energy / 1500);
        }

        if (this.state.battery instanceof StructureLink && this.room.storage) {
            let cooldown = this.state.battery.pos.getRangeTo(this.room.storage) + 3;
            let linkCount = this.room.storage.pos.findInRange(
                this.room.findStructures<StructureLink>(STRUCTURE_LINK), 2).length;
            let maxTransferable = Math.floor(((LINK_CAPACITY * .97) * linkCount) / cooldown);
            return Math.min(maxTransferable, storageCapacity);
        } else if (this.state.battery instanceof StructureContainer) {
            if (this.room.storage) { return storageCapacity; }
            return this.room.find(FIND_SOURCES).length * 10;
        } else {
            console.log(`unrecognized controller battery type in ${this.operation.name}, ${
                this.state.battery}`);
            return 0;
        }
    }

    /**
     * Positions on which it is viable for an upgrader to stand relative to battery/controller
     * @returns {Array}
     */
    private findUpgraderPositions(): RoomPosition[] {
        if (!this.state.battery) { return; }

        if (this.upgraderPositions) {
            return this.upgraderPositions;
        }

        // invalidates randomly
        if (this.memory.upgPositions) {
            this.upgraderPositions = RoomHelper.deserializeIntPositions(this.memory.upgPositions, this.room.name);
            return this.upgraderPositions;
        }

        let positions = [];
        for (let i = 1; i <= 8; i++) {
            let position = this.state.battery.pos.getPositionAtDirection(i);
            if (!position.isPassible(true) || !position.inRangeTo(this.room.controller, 3)
                || position.lookFor(LOOK_STRUCTURES).length > 0
                || position.lookFor(LOOK_CONSTRUCTION_SITES).length > 0) { continue; }
            positions.push(position);
        }
        this.memory.upgPositions = RoomHelper.serializeIntPositions(positions);
        return positions;
    }

    /**
     * Looks for structure to be used as an energy holder for upgraders
     * @returns { StructureLink | StructureStorage | StructureContainer }
     */
    private getBattery(structureType?: string): StoreStructure {
        let find = () => {
            this.memory.upgPositions = undefined;
            return _(this.room.controller.pos.findInRange(FIND_STRUCTURES, 3))
                .filter((structure: Structure) => {
                    if (structureType) {
                        return structure.structureType === structureType;
                    } else {
                        if (structure.structureType === STRUCTURE_CONTAINER
                            || structure.structureType === STRUCTURE_LINK) {
                            // mining from nearby sources interfere with upgraders
                            let sourcesInRange = structure.pos.findInRange(FIND_SOURCES, 2);
                            return sourcesInRange.length === 0;
                        }
                    }})
                .head() as StoreStructure;
        };

        return MemHelper.findObject<StoreStructure>(this, "battery", find);
    }

    private updatePathMission() {
        if (!this.state.battery) { return; }
        let startingPosition: {pos: RoomPosition} = this.room.storage;
        if (!startingPosition) {
            startingPosition = this.room.find<StructureSpawn>(FIND_MY_SPAWNS)[0];
        }
        if (startingPosition) {
            this.pathMission.updatePath(startingPosition.pos, this.state.battery.pos, 1);
        }
    }

    protected findDistanceToSpawn(): number {
        if (this.spawnGroup.room !== this.room) {
            console.log(`UPGRADER: remote spawning in ${this.room}`);
            this.state.remoteSpawning = true;
            return Game.map.getRoomLinearDistance(this.spawnGroup.room.name, this.room.name) * 50;
        } else {
            return super.findDistanceToSpawn(this.room.controller.pos);
        }
    }
}

type StoreStructure = StructureStorage | StructureTerminal | StructureContainer;

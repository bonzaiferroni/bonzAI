import {Mission} from "./Mission";
import {Operation} from "../operations/Operation";
import {TransportAnalysis} from "../../interfaces";
import {helper} from "../../helpers/helper";
import {empire} from "../../helpers/loopHelper";
import {RESERVE_AMOUNT, NEED_ENERGY_THRESHOLD, SUPPLY_ENERGY_THRESHOLD} from "../TradeNetwork";
import {Agent} from "./Agent";
export class UpgradeMission extends Mission {

    linkUpgraders: Agent[];
    batterySupplyCarts: Agent[];
    influxCarts: Agent[];
    paver: Agent;

    battery: StructureContainer | StructureStorage | StructureLink;
    boost: boolean;
    allowUnboosted: boolean;
    remoteSpawning: boolean;

    memory: {
        batteryPosition: RoomPosition
        cartCount: number
        positionCount: number
        roadRepairIds: string[]
        transportAnalysis: TransportAnalysis
        potency: number
        max: number
    };
    private _potencyPerCreep: number;

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
        this.allowUnboosted = allowUnboosted;
    }

    initMission() {
        if (!this.memory.cartCount) { this.memory.cartCount = 0; }
        if (this.spawnGroup.room !== this.room) {
            this.remoteSpawning = true;
            this.distanceToSpawn = Game.map.getRoomLinearDistance(this.spawnGroup.room.name, this.room.name);
        }
        else {
            this.distanceToSpawn = this.findDistanceToSpawn(this.room.controller.pos);
        }
        this.battery = this.findControllerBattery();
    }

    linkUpgraderBody = () => {

        if (this.memory.max !== undefined) {
            return this.workerBody(30, 4, 15);
        }

        if (this.remoteSpawning) {
            return this.workerBody(this.potencyPerCreep, 4, this.potencyPerCreep);
        }

        if (this.spawnGroup.maxSpawnEnergy < 800) {
            return this.bodyRatio(2, 1, 1, 1);
        }
        else {
            return this.workerBody(this.potencyPerCreep, 4, Math.ceil(this.potencyPerCreep / 2));
        }
    };

    getMax = () => this.findMaxUpgraders(this.totalPotency, this.potencyPerCreep);

    roleCall() {

        // memory
        let memory;
        if (this.boost || empire.network.hasAbundance(RESOURCE_CATALYZED_GHODIUM_ACID, RESERVE_AMOUNT * 2)) {
            memory = {boosts: [RESOURCE_CATALYZED_GHODIUM_ACID], allowUnboosted: this.allowUnboosted};
        }

        if (this.battery instanceof StructureContainer) {
            let analysis = this.cacheTransportAnalysis(25, this.totalPotency);
            this.batterySupplyCarts = this.headCount("upgraderCart",
                () => this.workerBody(0, analysis.carryCount, analysis.moveCount),
                () => analysis.cartsNeeded, { prespawn: this.distanceToSpawn,});
        }

        this.linkUpgraders = this.headCount("upgrader", this.linkUpgraderBody, this.getMax, {
            prespawn: this.distanceToSpawn,
            memory: memory
        } );

        if (this.memory.roadRepairIds && !this.remoteSpawning) {
            this.paver = this.spawnPaver();
        }

        let maxInfluxCarts = 0;
        let influxMemory;
        if (this.remoteSpawning) {
            if (this.room.storage && this.room.storage.store.energy < NEED_ENERGY_THRESHOLD
                && this.spawnGroup.room.storage && this.spawnGroup.room.storage.store.energy > SUPPLY_ENERGY_THRESHOLD) {
                maxInfluxCarts = 10;
                influxMemory = { originId: this.spawnGroup.room.storage.id };
            }
        }
        let influxCartBody = () => this.workerBody(0,25,25);
        this.influxCarts = this.headCount("influxCart", influxCartBody, () => maxInfluxCarts,
            { memory: influxMemory, skipMoveToRoom: true });
    }

    missionActions() {
        let index = 0;
        for (let upgrader of this.linkUpgraders) {
            this.linkUpgraderActions(upgrader, index);
            index++;
        }

        if (this.paver) {
            this.paverActions(this.paver);
        }

        if (this.batterySupplyCarts) {
            for (let cart of this.batterySupplyCarts) {
                this.batterySupplyCartActions(cart);
            }
        }

        for (let influxCart of this.influxCarts) {
            this.influxCartActions(influxCart);
        }

        if (this.battery) {
            let startingPosition: {pos: RoomPosition} = this.room.storage;
            if (!startingPosition) {
                startingPosition = this.room.find<StructureSpawn>(FIND_MY_SPAWNS)[0];
            }
            if (startingPosition) {
                this.pavePath(startingPosition, this.battery, 1, true);
            }
        }
    }

    finalizeMission() {
    }

    invalidateMissionCache() {
        if (Math.random() < .01) this.memory.positionCount = undefined;
        if (Math.random() < .1) this.memory.transportAnalysis = undefined;
    }

    private linkUpgraderActions(upgrader: Agent, index: number) {

        let battery = this.room.controller.getBattery();
        if (!battery) {
            upgrader.idleOffRoad(this.flag);
            return; // early
        }

        let outcome;
        if (battery instanceof StructureContainer && battery.hits < battery.hitsMax * 0.8) {
            outcome = upgrader.repair(battery);
        }
        else {
            outcome = upgrader.upgradeController(this.room.controller);
        }
        let myPosition = this.room.controller.getUpgraderPositions()[index];
        if (myPosition) {
            let range = upgrader.pos.getRangeTo(myPosition);
            if (range > 0) {
                upgrader.travelTo(myPosition, {range: 0});
            }
        }
        else {
            if (upgrader.pos.inRangeTo(battery, 3)) {
                upgrader.yieldRoad(battery);
            }
            else {
                upgrader.travelTo(battery);
            }
        }

        if (upgrader.carry[RESOURCE_ENERGY] < upgrader.carryCapacity / 4) {
            upgrader.withdraw(battery, RESOURCE_ENERGY);
        }
    }

    private findControllerBattery() {
        let battery = this.room.controller.getBattery();

        if (battery instanceof StructureContainer && this.room.controller.level >= 5) {
            battery.destroy();
            return;
        }

        if (battery instanceof StructureLink && this.room.controller.level < 5) {
            battery.destroy();
            return;
        }

        if (!battery) {
            let spawn = this.room.find<StructureSpawn>(FIND_MY_SPAWNS)[0];
            if (!spawn) return;
            if (!this.memory.batteryPosition) {
                this.memory.batteryPosition = this.findBatteryPosition(spawn);
                if (!this.memory.batteryPosition) return;
            }
            let structureType = STRUCTURE_LINK;
            if (this.room.controller.level < 5) {
                structureType = STRUCTURE_CONTAINER;
            }
            let position = helper.deserializeRoomPosition(this.memory.batteryPosition);
            if (position.lookFor(LOOK_CONSTRUCTION_SITES).length > 0) return;
            let outcome = position.createConstructionSite(structureType);
            console.log(`UPGRADE: placing battery in ${this.operation.name}, outcome: ${outcome}, ${position}`);
        }

        return battery;
    }

    private findBatteryPosition(spawn: StructureSpawn): RoomPosition {
        let path = this.findPavedPath(spawn.pos, this.room.controller.pos, 1);
        let positionsInRange = this.room.controller.pos.findInRange(path, 3);
        positionsInRange = _.sortBy(positionsInRange, (pos: RoomPosition) => pos.getRangeTo(spawn.pos));

        let mostSpots = 0;
        let bestPositionSoFar;
        for (let position of positionsInRange) {
            let sourcesInRange = position.findInRange(FIND_SOURCES, 2);
            if (sourcesInRange.length > 0) continue;
            let openSpotCount = _.filter(position.openAdjacentSpots(true),
                (pos: RoomPosition) => pos.getRangeTo(this.room.controller) <= 3).length;
            if (openSpotCount >= 5) return position;
            else if (openSpotCount > mostSpots) {
                mostSpots = openSpotCount;
                bestPositionSoFar = position;
            }
        }

        if (bestPositionSoFar) {
            return bestPositionSoFar;
        }
        else {
            console.log(`couldn't find controller battery position in ${this.operation.name}`);
        }
    }

    private batterySupplyCartActions(cart: Agent) {
        let controllerBattery = this.battery as StructureContainer;
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
            }
            else {
                influxCart.travelTo(originStorage, {ignoreRoads: true});
            }
            return;
        }

        if (influxCart.pos.isNearTo(this.room.storage)) {
            influxCart.transfer(this.room.storage, RESOURCE_ENERGY);
            influxCart.travelTo(originStorage, {ignoreRoads: true});
        }
        else {
            influxCart.travelTo(this.room.storage, {ignoreRoads: true});
        }
    }

    private findMaxUpgraders(totalPotency: number, potencyPerCreep: number): number {
        if (!this.battery) return 0;

        if (this.memory.max !== undefined) {
            console.log(`overriding max in ${this.operation.name}`);
            return this.memory.max;
        }

        let max = Math.min(Math.floor(totalPotency / potencyPerCreep), 5);
        if (this.room.controller.getUpgraderPositions()) {
            max = Math.min(this.room.controller.getUpgraderPositions().length, max)
        }

        return max
    }

    get potencyPerCreep(): number {
        if (!this._potencyPerCreep) {
            let potencyPerCreep;
            if (this.remoteSpawning) {
                potencyPerCreep = Math.min(this.totalPotency, 23)
            }
            else {
                let unitCost = 125;
                potencyPerCreep = Math.min(Math.floor((this.spawnGroup.maxSpawnEnergy - 200) / unitCost), 30, this.totalPotency);
            }
            this._potencyPerCreep = potencyPerCreep;
        }
        return this._potencyPerCreep;
    }

    get totalPotency(): number {
        if (!this.battery || this.room.hostiles.length > 0) return 0;

        if (!this.memory.potency || Game.time % 10 === 0) {
            if (this.room.controller.level === 8) {
                if (this.room.storage && this.room.storage.store.energy > NEED_ENERGY_THRESHOLD) {
                    return 15;
                }
                else {
                    return 1;
                }
            }

            if (this.room.find(FIND_MY_CONSTRUCTION_SITES).length > 0 &&
                (!this.room.storage || this.room.storage.store.energy < 50000)) {
                return 1;
            }

            let storageCapacity;
            if (this.room.storage) {
                storageCapacity = Math.floor(this.room.storage.store.energy / 1500);
            }

            if (this.battery instanceof StructureLink && this.room.storage) {
                let cooldown = this.battery.pos.getRangeTo(this.room.storage) + 3;
                let linkCount = this.room.storage.pos.findInRange(this.room.findStructures(STRUCTURE_LINK), 2).length;
                return Math.min(Math.floor(((LINK_CAPACITY * .97) * linkCount) / cooldown), storageCapacity);
            }
            else if (this.battery instanceof StructureContainer) {
                if (this.room.storage) return storageCapacity;
                return this.room.find(FIND_SOURCES).length * 10;
            }
            else {
                console.log(`unrecognized controller battery type in ${this.operation.name}, ${this.battery.structureType}`);
                return 0;
            }
        }

        return this.memory.potency;
    }
}
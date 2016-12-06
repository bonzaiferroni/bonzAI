import {Mission} from "./Mission";
import {Operation} from "./Operation";
import {RESERVE_AMOUNT} from "./constants";
import {helper} from "./helper";
import {TransportAnalysis} from "./interfaces";
export class UpgradeMission extends Mission {

    linkUpgraders: Creep[];
    batterySupplyCarts: Creep[];
    paver: Creep;

    battery: StructureContainer | StructureStorage | StructureLink;
    boost: boolean;
    allowUnboosted: boolean;

    memory: {
        batteryPosition: RoomPosition
        cartCount: number
        positionCount: number
        max: number
        roadRepairIds: string[]
        transportAnalysis: TransportAnalysis
        containerCapacity: number
    };

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
        this.distanceToSpawn = this.findDistanceToSpawn(this.room.controller.pos);
        this.battery = this.findControllerBattery()
    }

    roleCall() {

        // memory
        let memory;
        if (this.boost || this.empire.hasAbundance(RESOURCE_CATALYZED_GHODIUM_ACID, RESERVE_AMOUNT * 2)) {
            memory = {boosts: [RESOURCE_CATALYZED_GHODIUM_ACID], allowUnboosted: this.allowUnboosted};
        }

        let potency = this.findUpgraderPotency();
        let max = this.findMaxUpgraders();

        let linkUpgraderBody = () => {
            if (this.spawnGroup.maxSpawnEnergy < 800) {
                return this.bodyRatio(2, 1, 1, 1);
            }

            return this.workerBody(potency, 4, Math.ceil(potency / 2));
        };

        this.linkUpgraders = this.headCount("upgrader", linkUpgraderBody, max, {prespawn: this.distanceToSpawn, memory: memory} );

        if (this.battery instanceof StructureContainer) {
            let analysis = this.analyzeTransport(25, potency);
            this.batterySupplyCarts = this.headCount("upgraderCart", () => analysis.body, analysis.cartsNeeded, { prespawn: 25 });
        }

        if (this.memory.roadRepairIds) {
            this.paver = this.spawnPaver();
        }
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

        if (this.battery) {
            this.pavePath({pos: this.spawnGroup.pos}, this.battery, 1, true);
        }
    }

    finalizeMission() {
    }

    invalidateMissionCache() {
        if (Math.random() < .01) this.memory.positionCount = undefined;
        if (Math.random() < .1) this.memory.transportAnalysis = undefined;
    }

    private upgraderActions(upgrader: Creep) {
        if (upgrader.pos.inRangeTo(this.room.controller, 3)) {
            upgrader.upgradeController(this.room.controller);
            upgrader.memory.inPosition = true;
            upgrader.memory.scavanger = RESOURCE_ENERGY;
            upgrader.yieldRoad(this.room.controller);
        }
        else {
            upgrader.blindMoveTo(this.room.controller);
            upgrader.memory.inPosition = false;
        }
    }

    private linkUpgraderActions(upgrader: Creep, index: number) {

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
                upgrader.blindMoveTo(myPosition);
            }
        }
        else {
            if (upgrader.pos.inRangeTo(battery, 3)) {
                upgrader.yieldRoad(battery);
            }
            else {
                upgrader.blindMoveTo(battery);
            }
        }

        if (upgrader.carry[RESOURCE_ENERGY] < upgrader.carryCapacity / 4) {
            upgrader.withdraw(battery, RESOURCE_ENERGY);
        }
    }

    private supplyUpgrader(cart: Creep, suppliedCreep: Creep) {
        let hasload = this.hasLoad(cart);
        if (!hasload) {
            this.procureEnergy(cart, suppliedCreep);
            return;
        }

        // has energy
        if (!suppliedCreep || suppliedCreep.carry.energy > suppliedCreep.carryCapacity * 0.8) {
            cart.idleOffRoad(this.flag);
            return;
        }

        // has target with room for more energy
        let outcome = cart.transfer(suppliedCreep, RESOURCE_ENERGY);
        if (outcome === ERR_NOT_IN_RANGE) {
            cart.blindMoveTo(suppliedCreep);
        }
        else if (suppliedCreep.carry.energy < suppliedCreep.carryCapacity / 2 && outcome === OK) {
            this.procureEnergy(cart, suppliedCreep);
        }
    }

    private findControllerBattery() {
        let battery = this.room.controller.getBattery();

        if (battery instanceof StructureContainer && this.room.controller.level >= 5) {
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
            console.log(`UPGRADE: placing battery in ${this.opName}, outcome: ${outcome}, ${position}`);
        }

        return battery
    }

    private findBatteryPosition(spawn: StructureSpawn): RoomPosition {
        let path = this.findPavedPath(spawn.pos, this.room.controller.pos, 1);
        let positionsInRange = this.room.controller.pos.findInRange(path, 3);
        positionsInRange = _.sortBy(positionsInRange, (pos: RoomPosition) => pos.getRangeTo(spawn.pos));

        let mostSpots = 0;
        let bestPositionSoFar;
        for (let position of positionsInRange) {
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
            console.log(`couldn't find controller battery position in ${this.opName}`);
        }
    }

    private findUpgraderPotency(): number {
        let potency = Math.min(Math.floor((this.spawnGroup.maxSpawnEnergy - 200) / 150), 30);
        if (this.room.controller.level === 8) {
            potency = Math.min(15, potency);
        }
        if (this.room.storage) {
            potency = Math.min(this.room.storage.store[RESOURCE_ENERGY] / 3000, potency);
        }

        return Math.max(potency, 1);
    }

    private findMaxUpgraders(): number {
        if (!this.battery) return 0;

        let maxBatteryCapacity = this.findMaxBatteryCapacity();

        // determine max
        if (!this.memory.positionCount) this.memory.positionCount = this.room.controller.getUpgraderPositions().length;
        let max = Math.min(
            this.memory.positionCount,
            maxBatteryCapacity,
            5
        );
        if (this.opType === "conquest") max = 1;
        if (this.memory.max !== undefined) max = this.memory.max;
        if (this.room.controller.level === 8) max = 1;
        if (this.room.hostiles.length > 0) max = 0;

        return max
    }

    private findMaxBatteryCapacity() {
        if (this.battery instanceof StructureLink && this.room.storage) {
            let range = this.battery.pos.getRangeTo(this.room.storage);
            return Math.ceil(80 / range);
        }
        else if (this.battery instanceof StructureContainer) {
            if (this.memory.containerCapacity === undefined) this.memory.containerCapacity = 0;
            // interpolate current value with value from memory
            this.memory.containerCapacity = this.memory.containerCapacity + .1 * (this.battery.store.energy - this.memory.containerCapacity);
            return Math.ceil(this.memory.containerCapacity / 400);
        }
        else {
            return 0;
        }
    }

    private batterySupplyCartActions(cart: Creep) {
        let battery = this.battery as StructureContainer;
        let hasLoad = this.hasLoad(cart);
        if (!hasLoad) {
            let cartBattery: StructureContainer | StructureStorage = this.room.storage;
            if (!cartBattery) {
                let find = (): Structure => {
                    let containers = _.filter(this.room.findStructures(STRUCTURE_CONTAINER),
                        (container: StructureContainer) => container !== battery && container.store.energy > 100 && container.pos.lookFor(LOOK_CREEPS).length > 0 );
                    containers = _.sortBy(containers, (container: StructureContainer) => cart.pos.getRangeTo(container));
                    return containers[0] as Structure;
                };
                let forget = (structure: Structure): boolean => {
                    return structure.pos.lookFor(LOOK_CREEPS).length === 0
                };
                cartBattery = cart.rememberStructure(find, forget) as StructureContainer;
            }

            if (cartBattery) {
                if (cart.pos.isNearTo(cartBattery)) {
                    cart.withdrawIfFull(cartBattery, RESOURCE_ENERGY);
                    if (cartBattery.store.energy > cart.carryCapacity) {
                        cart.blindMoveTo(battery);
                    }
                }
                else {
                    cart.blindMoveTo(cartBattery, {maxRooms: 1});
                }
            }
            else {
                cart.idleOffRoad(this.flag);
            }
            return;
        }

        let rangeToBattery = cart.pos.getRangeTo(battery);
        if (rangeToBattery > 3) {
            cart.blindMoveTo(battery, {maxRooms: 1});
            return;
        }

        if (battery.store.energy === battery.storeCapacity) {
            cart.yieldRoad(battery);
            return;
        }

        if (rangeToBattery > 1) {
            cart.blindMoveTo(battery, {maxRooms: 1});
            return;
        }

        cart.transfer(battery, RESOURCE_ENERGY);
    }
}
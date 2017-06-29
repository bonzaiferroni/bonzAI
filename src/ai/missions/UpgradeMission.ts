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
import {Traveler} from "../Traveler";

interface UpgradeMemory extends MissionMemory {
    batteryPosition: RoomPosition;
    roadRepairIds: string[];
    transportAnalysis: TransportAnalysis;
    upgPositions: string;
    batteryId: string;
    potency: number;
    storageDistance: number;
    spawnDistance: number;
}

interface UpgradeState extends MissionState {
    battery: StoreStructure;
    potencyPerCreep: number;
    distanceToSpawn: number;
    potency: number;
    upgraderPositions: RoomPosition[];
}

export class UpgradeMission extends Mission {

    private upgraders: Agent[];
    private carts: Agent[];
    private influxCarts: Agent[];
    private batteryId: string;
    private pathMission: PathMission;
    private spawnDistance: number;
    private boosts: string[];
    private saverMode: boolean;
    private remoteSpawning: boolean;
    private storageDistance: number;

    public memory: UpgradeMemory;
    public state: UpgradeState;

    /**
     * Controller upgrading. Will look for a suitable controller battery (StructureContainer, StructureStorage,
     * StructureLink) and if one isn't found it will spawn SupplyMission to bring energy to upgraders
     * @param operation
     */

    constructor(operation: Operation) {
        super(operation, "upgrade");
    }

    public init() {

        // vision can be assumed after this point
        if (!this.state.hasVision) {
            this.operation.sleepMission(this, 100);
            return;
        }

        // remove mission if fully upgraded and in saverMode
        if (Memory.playerConfig.saverMode && this.room.controller.level === 8) {
            this.saverMode = true;
            if (this.room.controller.ticksToDowngrade > 100000) {
                this.operation.sleepMission(this, this.room.controller.ticksToDowngrade - 100000, false);
                return;
            }
        }

        // find battery or remove mission
        let battery = this.findControllerBattery();
        if (battery) {
            this.batteryId = battery.id;
        }

        // maintain path
        if (this.room.controller.level < 8) {
            this.pathMission = new PathMission(this.operation, this.name + "Path");
            this.operation.addMissionLate(this.pathMission);
        }

        // figure out boost
        if (this.room.controller.level < 8) {
            this.boosts = [RESOURCE_CATALYZED_GHODIUM_ACID];
        }

        // use remote group when appropriate
        let remoteSpawnData = this.operation.remoteSpawn;
        if ((this.room.controller.level < 6 || !this.room.terminal) && remoteSpawnData) {
            let remoteGroup = this.operation.remoteSpawn.spawnGroup;
            let remoteSpawning = remoteGroup && remoteGroup.room.controller.level >= 7 && remoteSpawnData.distance <= 500;
            if (remoteSpawning) {
                this.remoteSpawning = true;
                this.spawnGroup = remoteGroup;
                this.spawnDistance = remoteSpawnData.distance;
            }
        } else {
            let spawn = this.room.findStructures<StructureSpawn>(STRUCTURE_SPAWN)[0];
            if (spawn && battery) {
                if (!this.memory.spawnDistance) {
                    this.memory.spawnDistance = Traveler.findTravelPath(spawn, battery, {
                        offRoad: true,
                    }).path.length;
                }
                this.spawnDistance = this.memory.spawnDistance;
            } else {
                this.spawnDistance = 50;
            }
        }

        // storage distance
        this.storageDistance = 40;
        if (this.room.storage && battery) {
            if (!this.memory.storageDistance) {
                this.memory.storageDistance = Traveler.findTravelPath(this.room.storage, battery, {
                    offRoad: true,
                }).path.length;
            }
            this.storageDistance = this.memory.storageDistance;
        } else if (battery) {
            let sumDistance = _.sum(this.state.sources, x => Traveler.findTravelPath(battery, x).path.length);
            this.storageDistance = Math.ceil(sumDistance / this.state.sources.length);
        }
    }

    public update() {
        this.state.battery = Game.getObjectById<StoreStructure>(this.batteryId);
        this.state.upgraderPositions = this.findUpgraderPositions();
        this.updatePathMission();
    }

    private upgraderBody = () => {
        if (this.saverMode) { return this.workerBody(1, 1, 1); }

        let potencyPerCreep = this.potencyPerCreep();
        if (this.room !== this.spawnGroup.room) {
            return this.workerBody(potencyPerCreep, 4, potencyPerCreep);
        }

        if (this.spawnGroup.maxSpawnEnergy < 800) {
            return this.bodyRatio(2, 1, 1, 1);
        } else {
            return this.workerBody(potencyPerCreep, 4, Math.ceil(potencyPerCreep / 2));
        }
    };

    private getMax = (): number => {
        if (!this.state.battery || this.room.hostiles.length > 0) { return 0; }
        if (!this.room.storage && !this.remoteSpawning
            && this.room.find(FIND_MY_CONSTRUCTION_SITES).length >= 2) { return 0; }

        let potency = this.getPotency();
        let potencyPerCreep = this.potencyPerCreep();
        let max = Math.min(Math.ceil(potency / potencyPerCreep), this.state.upgraderPositions.length);
        return max;
    };

    private maxCarts = (): number => {
        if (!(this.state.battery instanceof StructureContainer)) {
            return 0;
        }
        let analysis = this.cacheTransportAnalysis(this.storageDistance, this.getPotency());
        return Math.min(analysis.cartsNeeded, this.roleCount("upgrader"));
    };

    private cartBody = () => {
        let analysis = this.cacheTransportAnalysis(this.storageDistance, this.getPotency());
        return this.workerBody(0, analysis.carryCount, analysis.moveCount);
    };

    private maxInfluxCarts = (): number => {
        let invalidSpawnRoom = !this.remoteSpawning ||
            this.spawnGroup.maxSpawnEnergy < 2400 || this.spawnGroup.averageAvailability < 1;
        if (invalidSpawnRoom) {
            return 0;
        }
        // TODO: reenable this
        return Math.min(0, this.room.controller.level * 2);
    };

    private influxCartBody = () => {
        return this.workerBody(0, 25, 25);
    };

    public roleCall() {

        this.carts = this.headCount("upgraderCart", this.cartBody, this.maxCarts, {
            prespawn: this.spawnDistance,
        });

        this.upgraders = this.headCount("upgrader", this.upgraderBody, this.getMax, {
            prespawn: this.spawnDistance,
            boosts: this.boosts,
            allowUnboosted: true,
        });

        this.influxCarts = this.headCount("influxCart", this.influxCartBody, this.maxInfluxCarts, {
            skipMoveToRoom: true,
        });
    }

    public actions() {
        let index = 0;
        for (let upgrader of this.upgraders) {
            this.upgraderActions(upgrader, index);
            index++;
        }

        for (let cart of this.carts) {
            this.cartActions(cart);
        }

        for (let cart of this.influxCarts) {
            this.influxCartActions(cart);
        }
    }

    public finalize() {
    }

    public invalidateCache() {
        this.memory.upgPositions = undefined;
    }

    private upgraderActions(upgrader: Agent, index: number) {

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

    // Find a battery if it exists, or places a construction site
    private findControllerBattery() {

        if (!this.memory.batteryPosition) {
            let spawn = this.room.find<StructureSpawn>(FIND_MY_SPAWNS)[0];
            if (!spawn) { return; }
            this.memory.batteryPosition = this.findBatteryPosition(spawn);
            if (!this.memory.batteryPosition) { return; }
        }

        let position = helper.deserializeRoomPosition(this.memory.batteryPosition);

        let battery = _(position.lookFor<Structure>(LOOK_STRUCTURES)
            .filter(x => x instanceof StructureContainer || x instanceof StructureLink))
            .head();

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
            let structureType = STRUCTURE_LINK;
            if (this.room.controller.level < 5) {
                structureType = STRUCTURE_CONTAINER;
            }

            if (position.lookFor(LOOK_CONSTRUCTION_SITES).length > 0) { return; }
            let outcome = position.createConstructionSite(structureType);
            console.log(`UPGRADE: placing battery in ${this.operation.name}, outcome: ${outcome}, ${position}`);
        }

        return battery;
    }

    private findBatteryPosition(spawn: StructureSpawn): RoomPosition {

        let controllerPos = this.room.controller.pos;
        let currentBattery = _(controllerPos.findInRange(this.room.findStructures<Structure>(STRUCTURE_LINK), 3))
            .filter(x => x.pos.findInRange(this.state.sources, 2).length === 0)
            .head();
        if (currentBattery) {
            return currentBattery.pos;
        }

        currentBattery = _(controllerPos.findInRange(this.room.findStructures<Structure>(STRUCTURE_CONTAINER), 3))
            .filter(x => !x.pos.lookFor(LOOK_FLAGS)[0])
            .filter(x => x.pos.findInRange(this.state.sources, 1).length === 0)
            .head();
        if (currentBattery) {
            return currentBattery.pos;
        }

        let ret = Traveler.findTravelPath(spawn.pos, this.room.controller.pos, {
            offRoad: true,
            maxRooms: 1,
            roomCallback: (roomName, matrix) => {
                if (roomName !== this.roomName) { return; }
                matrix = matrix.clone();
                for (let source of this.state.sources) {
                    helper.blockOffPosition(matrix, source, 4, 30, true);
                }
                helper.blockOffPosition(matrix, this.state.mineral, 4, 30, true);
                return matrix;
            }}
        );
        let positionsInRange = this.room.controller.pos.findInRange(ret.path, 3);
        positionsInRange = _.sortBy(positionsInRange, (pos: RoomPosition) => pos.getRangeTo(spawn.pos));

        let mostSpots = 0;
        let bestPositionSoFar;
        for (let position of positionsInRange) {
            let sourcesInRange = position.findInRange(FIND_SOURCES, 2);
            if (sourcesInRange.length > 0) { continue; }
            let openSpotCount = _.filter(position.openAdjacentSpots(true),
                (pos: RoomPosition) => pos.getRangeTo(this.room.controller) <= 3).length;
            if (openSpotCount > mostSpots) {
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

    private cartActions(cart: Agent) {
        let controllerBattery = this.state.battery as StructureContainer;
        if (!controllerBattery) {
            cart.idleOffRoad();
            return;
        }

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

    private potencyPerCreep(): number {
        if (!this.state.potencyPerCreep) {
            let potencyPerCreep;
            let potency = this.getPotency();
            if (this.remoteSpawning) {
                potencyPerCreep = Math.min(potency, 23);
            } else {
                let unitCost = 125;
                let maxLocalPotency = Math.floor((this.spawnGroup.maxSpawnEnergy - 200) / unitCost);
                potencyPerCreep = Math.min(maxLocalPotency, 30, potency);
            }
            this.state.potencyPerCreep = potencyPerCreep;
        }
        return this.state.potencyPerCreep;
    }

    private getPotency(): number {
        if (!this.state.potency) {

            if (this.room.controller.level === 8) {
                // cpu saving mechanism
                if (this.saverMode) {
                    return 1;
                } else if (this.room.storage && this.room.storage.store.energy > NEED_ENERGY_THRESHOLD) {
                    return 15;
                } else {
                    return 1;
                }
            }

            let storageCapacity;
            if (this.room.storage && this.room.controller.level >= 4) {
                storageCapacity = Math.floor(this.room.storage.store.energy / 1500);
            }

            if (this.state.battery instanceof StructureLink && this.room.storage) {
                let cooldown = this.state.battery.pos.getRangeTo(this.room.storage) + 3;
                let linkCount = this.room.storage.pos.findInRange(
                    this.room.findStructures<StructureLink>(STRUCTURE_LINK), 2).length;
                let maxTransferable = Math.floor(((LINK_CAPACITY * .97) * linkCount) / cooldown);
                return Math.min(maxTransferable, storageCapacity);
            } else if (this.state.battery instanceof StructureContainer) {
                if (this.room.storage && this.room.controller.level >= 4) { return storageCapacity; }
                return this.room.find(FIND_SOURCES).length * 10;
            } else {
                console.log(`unrecognized controller battery type in ${this.operation.name}, ${
                    this.state.battery}`);
                return 0;
            }
        }
    }

    /**
     * Positions on which it is viable for an upgrader to stand relative to battery/controller
     * @returns {Array}
     */
    private findUpgraderPositions(): RoomPosition[] {
        if (!this.state.battery) { return; }

        if (this.state.upgraderPositions) {
            return this.state.upgraderPositions;
        }

        // invalidates randomly
        if (this.memory.upgPositions) {
            this.state.upgraderPositions = RoomHelper.deserializeIntPositions(this.memory.upgPositions, this.room.name);
            return this.state.upgraderPositions;
        }

        let positions = [];
        for (let i = 1; i <= 8; i++) {
            let position = this.state.battery.pos.getPositionAtDirection(i);
            let invalidPosition = !position.isPassible(true) || !position.inRangeTo(this.room.controller, 3)
                || position.lookFor(LOOK_STRUCTURES).length > 0
                || position.lookFor(LOOK_CONSTRUCTION_SITES).length > 0;
            if (invalidPosition) { continue; }
            positions.push(position);
        }
        this.memory.upgPositions = RoomHelper.serializeIntPositions(positions);
        return positions;
    }

    private updatePathMission() {
        if (this.room.controller.level === 8) { return; }
        let startingPosition: {pos: RoomPosition} = this.room.storage;
        if (!startingPosition) {
            startingPosition = this.room.find<StructureSpawn>(FIND_MY_SPAWNS)[0];
        }
        if (startingPosition) {
            let batteryPos: RoomPosition;
            if (this.state.battery) {
                batteryPos = this.state.battery.pos;
            } else if (this.memory.batteryPosition) {
                batteryPos = helper.deserializeRoomPosition(this.memory.batteryPosition);
            } else {
                return;
            }
            this.pathMission.updatePath(startingPosition.pos, batteryPos, 0);
        }
    }

    private influxCartActions(cart: Agent) {
        let hasLoad = cart.hasLoad();
        if (!hasLoad) {

            // suicide on/near container if you can't make journey
            if (cart.room === this.room && cart.ticksToLive < this.spawnDistance * 2.2) {
                let destination = cart.findClosestContainer(this.room);
                if (destination) {
                    if (cart.pos.isNearTo(destination)) {
                        if (cart.pos.inRangeTo(destination, 0)) {
                            cart.suicide();
                            return;
                        }
                        if (destination.pos.lookFor(LOOK_CREEPS).length === 0) {
                            cart.travelTo(destination);
                            return;
                        }
                        cart.suicide();
                        return;
                    } else {
                        cart.travelTo(destination);
                    }
                    return;
                }
            }

            // get energy
            let destination = this.spawnGroup.room.storage;
            if (!destination) {
                cart.idleOffRoad();
                return;
            }
            if (cart.pos.isNearTo(destination)) {
                cart.withdraw(destination, RESOURCE_ENERGY);
            } else {
                cart.travelTo(destination, {offRoad: true, preferHighway: true});
            }
            return;
        }

        // deliver energy
        let destination: StoreStructure = this.room.storage;
        if (!destination) {
            destination = cart.findClosestContainer(this.room, true);
        }
        if (!destination) {
            cart.idleOffRoad();
            return;
        }
        if (cart.pos.isNearTo(destination)) {
            cart.transfer(destination, RESOURCE_ENERGY);
        } else {
            cart.travelTo(destination, {preferHighway: true});
        }
    }
}

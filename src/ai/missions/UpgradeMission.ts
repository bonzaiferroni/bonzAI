import {Mission, MissionMemory, MissionState} from "./Mission";
import {Operation} from "../operations/Operation";
import {TransportAnalysis} from "../../interfaces";
import {helper} from "../../helpers/helper";
import {RESERVE_AMOUNT, NEED_ENERGY_THRESHOLD, SUPPLY_ENERGY_THRESHOLD} from "../TradeNetwork";
import {Agent} from "../agents/Agent";
import {RoomHelper} from "../../helpers/RoomHelper";
import {MatrixHelper} from "../../helpers/MatrixHelper";
import {PaveData, PaverMission} from "./PaverMission";
import {Notifier} from "../../notifier";
import {PosHelper} from "../../helpers/PosHelper";
import {Traveler} from "../../Traveler/Traveler";

interface UpgradeMemory extends MissionMemory {
    nextAddPotency: number;
    addPotency: number;
    batteryPosition: RoomPosition;
    roadRepairIds: string[];
    transportAnalysis: TransportAnalysis;
    upgPositions: string;
    batteryId: string;
    potency: number;
    storageDistance: number;
    spawnDistance: number;
    cartDistance: number;
    influxDelay: number;
}

interface UpgradeState extends MissionState {
    battery: StoreStructure;
    potencyPerCreep: number;
    distanceToSpawn: number;
    potency: number;
}

export class UpgradeMission extends Mission {

    private upgraders: Agent[];
    private carts: Agent[];
    private influxCarts: Agent[];
    private batteryId: string;
    private spawnDistance: number;
    private boosts: string[];
    private saverMode: boolean;
    private remoteSpawning: boolean;
    private upgraderPositions: RoomPosition[];

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
    }

    public update() {
        this.state.battery = Game.getObjectById<StoreStructure>(this.batteryId);
        this.findUpgraderPositions();
        PaverMission.updatePath(this.memory, this.paverCallback);
    }

    private paverCallback = (): PaveData => {
        if (this.room.controller.level === 8) { return; }
        let startingPosition: {pos: RoomPosition} = this.room.storage;
        if (!startingPosition) {
            startingPosition = this.room.find<StructureSpawn>(FIND_MY_SPAWNS)[0];
        }

        let batteryPos: RoomPosition;
        if (this.state.battery) {
            batteryPos = this.state.battery.pos;
        } else if (this.memory.batteryPosition) {
            batteryPos = helper.deserializeRoomPosition(this.memory.batteryPosition);
        } else {
            return;
        }

        return {
            id: this.operation.name + this.name,
            endPos: batteryPos,
            startPos: startingPosition.pos,
            rangeToEnd: 1,
        };
    };

    protected upgraderBody = () => {
        if (this.saverMode) { return this.workerBody(1, 1, 1); }

        let potencyPerCreep = this.potencyPerCreep();
        if (this.room !== this.spawnGroup.room) {
            return this.workerBody(potencyPerCreep, 4, potencyPerCreep);
        }

        if (this.spawnGroup.maxSpawnEnergy < 800) {
            return this.workerUnitBody(2, 1, 1);
        } else {
            return this.workerBody(potencyPerCreep, 4, Math.ceil(potencyPerCreep / 2));
        }
    };

    protected maxUpgraders = (): number => {
        if (!this.state.battery || this.room.hostiles.length > 0) { return 0; }
        if (!this.room.storage && !this.remoteSpawning
            && this.room.find(FIND_MY_CONSTRUCTION_SITES).length >= 2 && this.state.battery.store[RESOURCE_ENERGY] < 1000) {
            return 0;
        }

        let potency = this.getPotency();
        let potencyPerCreep = this.potencyPerCreep();
        let max = Math.min(Math.ceil(potency / potencyPerCreep), this.upgraderPositions.length);
        return max;
    };

    protected maxCarts = (): number => {
        if (!(this.state.battery instanceof StructureContainer)) {
            return 0;
        }
        let cartDistance = this.findCartDistance();
        let analysis = this.cacheTransportAnalysis(cartDistance, this.getPotency());
        return Math.min(analysis.cartsNeeded, this.roleCount("upgrader"));
    };

    private cartBody = () => {
        let cartDistance = this.findCartDistance();
        let analysis = this.cacheTransportAnalysis(cartDistance, this.getPotency());
        return this.workerBody(0, analysis.carryCount, analysis.moveCount);
    };

    private maxInfluxCarts = (): number => {
        if (!this.state.battery) { return 0; }
        if (this.state.battery instanceof StructureContainer) {
            if (_.sum(this.state.battery.store) > this.state.battery.storeCapacity * .5) {
                return 0;
            }
        }

        if (this.memory.influxDelay > Game.time) { return 0; }

        let invalidSpawnRoom = !this.remoteSpawning ||
            this.spawnGroup.maxSpawnEnergy < 2500 || this.spawnGroup.averageAvailability < 1 ||
            !this.spawnGroup.room.storage || this.spawnGroup.room.storage.store[RESOURCE_ENERGY] < NEED_ENERGY_THRESHOLD;
        if (invalidSpawnRoom) {
            return 0;
        }
        // TODO: reenable this
        return Math.min(this.room.controller.level, 4);
    };

    private influxCartBody = () => {
        return this.workerBody(0, 25, 25);
    };

    public roleCall() {

        this.carts = this.headCount("upgraderCart", this.cartBody, this.maxCarts, {
            prespawn: this.spawnDistance,
        });

        this.upgraders = this.headCount("upgrader", this.upgraderBody, this.maxUpgraders, {
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
        delete this.memory.upgPositions;
        if (this.room.storage) {
            delete this.memory.addPotency;
            delete this.memory.nextAddPotency;
        }
        if (Math.random() < .01) {
            delete this.memory.cartDistance;
        }
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
        let myPosition = this.upgraderPositions[index];
        if (myPosition) {
            let range = upgrader.pos.getRangeTo(myPosition);
            if (range > 0) {
                upgrader.moveItOrLoseIt(myPosition, "upgrader", false, {range: 0});
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
    protected findControllerBattery() {

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
                    MatrixHelper.blockOffPosition(matrix, source, 3, 10, true);
                }
                MatrixHelper.blockOffPosition(matrix, this.state.mineral, 3, 10, true);
                let wallPositions = PosHelper.findTerrainInRange(this.room.controller.pos, "wall", 3);
                console.log(wallPositions.length);
                for (let wallPos of wallPositions) {
                    MatrixHelper.blockOffPosition(matrix, {pos: wallPos}, 1, 10, true);
                }
                MatrixHelper.showMatrix(matrix, roomName);
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
            cart.procureEnergy({nextDestination: agent => controllerBattery});
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

    protected getPotency(): number {

        if (this.room.controller.level === 8) {
            if (this.saverMode) {
                return 1;
            } else if (this.room.storage && this.room.storage.store.energy > NEED_ENERGY_THRESHOLD) {
                return 15;
            } else {
                return 1;
            }
        }

        if (this.state.potency) {
            return this.state.potency;
        }

        let storageCapacity;
        if (this.room.storage && this.room.controller.level >= 4) {
            storageCapacity = Math.floor(this.room.storage.store.energy / 1500);
        }

        let potency;
        if (this.state.battery instanceof StructureLink && this.room.storage) {
            let cooldown = this.state.battery.pos.getRangeTo(this.room.storage) + 3;
            let linkCount = this.room.storage.pos.findInRange(
                this.room.findStructures<StructureLink>(STRUCTURE_LINK), 2).length;
            let maxTransferable = Math.floor(((LINK_CAPACITY * .97) * linkCount) / cooldown);
            potency = Math.min(maxTransferable, storageCapacity);
        } else if (this.state.battery instanceof StructureContainer) {
            if (storageCapacity) {
                potency = storageCapacity;
            } else {
                potency = this.room.find(FIND_SOURCES).length * 10 + this.findAdditionalPotency();
            }
        } else {
            console.log(`unrecognized controller battery type in ${this.operation.name}, ${
                this.state.battery}`);
            potency = 0;
        }

        this.state.potency = potency;
        return potency;
    }

    /**
     * Positions on which it is viable for an upgrader to stand relative to battery/controller
     * @returns {Array}
     */
    private findUpgraderPositions(): RoomPosition[] {
        if (!this.state.battery) { return; }

        let invalidate = Math.random() > .99;
        if (this.upgraderPositions && !invalidate) {
            return;
        }

        // invalidates randomly
        if (this.memory.upgPositions && !invalidate) {
            this.upgraderPositions = RoomHelper.deserializeIntPositions(this.memory.upgPositions, this.room.name);
            return;
        }

        let positions = [];
        for (let i = 1; i <= 8; i++) {
            let position = this.state.battery.pos.getPositionAtDirection(i);
            let invalidPosition = !position.isPassible(true) || !position.inRangeTo(this.room.controller, 3)
                || position.lookForStructure(STRUCTURE_ROAD) || position.lookFor(LOOK_CONSTRUCTION_SITES).length > 0
                || (this.room.terminal && position.isNearTo(this.room.terminal));
            if (invalidPosition) { continue; }
            positions.push(position);
        }

        this.memory.upgPositions = RoomHelper.serializeIntPositions(positions);
        this.upgraderPositions = positions;
    }

    private influxCartActions(cart: Agent) {

        if (cart.hits < cart.hitsMax) {
            this.memory.influxDelay = Game.time + 3000;
            if (cart.room.hostiles.length === 0) {
                let tower = cart.room.findStructures<StructureTower>(STRUCTURE_TOWER)[0];
                if (tower) {
                    tower.heal(cart.creep);
                }
            }
        }

        let hasLoad = cart.hasLoad();
        if (!hasLoad) {

            // suicide on/near container if you can't make journey
            if (cart.room === this.room && cart.ticksToLive < this.spawnDistance * 2.2) {
                let destination = cart.findAnyEmpty(this.room);
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
        let destination: Structure = this.room.storage;
        if (!destination) {
            destination = cart.findAnyEmpty(this.room);
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

    private findAdditionalPotency(): number {
        if (!this.memory.addPotency || (!this.memory.nextAddPotency || Game.time > this.memory.nextAddPotency)) {
            this.memory.nextAddPotency = Game.time + 1000;
            if (this.memory.addPotency === undefined) { this.memory.addPotency = 0; }

            if (this.roleCount("upgrader") < 1 || this.room.find(FIND_MY_CONSTRUCTION_SITES).length > 0) {
                this.memory.nextAddPotency = Game.time + 100;
            } else {
                if (this.state.battery.store >= this.state.battery.storeCapacity * .66) {
                    this.memory.addPotency += 10;
                    Notifier.log(`UPGRADER: adding more container potency in ${this.roomName}`, 1);
                } else if (this.state.battery.store <= this.state.battery.storeCapacity * .33) {
                    this.memory.addPotency -= 10;
                    Notifier.log(`UPGRADER: removing container potency in ${this.roomName}`, 4);
                }
            }
            this.memory.addPotency = Math.max(this.memory.addPotency, 0);
        }
        return this.memory.addPotency;
    }

    private findCartDistance(): number {
        if (!this.state.battery) {
            return 50;
        }

        if (!this.memory.cartDistance) {
            let distance = 50;
            if (this.room.storage) {
                let storageDistance = Traveler.findPathDistance(this.state.battery, this.room.storage);
                if (storageDistance > 0) {
                    distance = storageDistance;
                }
            } else {
                let furthestDistance = 0;
                for (let source of this.state.sources) {
                    let sourceDistance = Traveler.findPathDistance(this.state.battery, source);
                    if (sourceDistance > furthestDistance) {
                        furthestDistance = sourceDistance;
                    }
                }
                if (furthestDistance > 0) {
                    distance = furthestDistance;
                }
            }
            this.memory.cartDistance = distance;
        }

        return this.memory.cartDistance;
    }
}

import {Mission} from "./Mission";
import {Operation} from "../operations/Operation";
import {helper} from "../../helpers/helper";
import {TransportAnalysis} from "../../interfaces";
export class BuildMission extends Mission {

    builders: Creep[];
    supplyCarts: Creep[];
    sites: ConstructionSite[];
    walls: StructureRampart[];
    remoteSpawn: boolean;
    priorityStructures: string[] = [STRUCTURE_CONTAINER, STRUCTURE_EXTENSION, STRUCTURE_STORAGE, STRUCTURE_TOWER];

    memory: {
        maxHitsToBuild: number
        max: number
        activateBoost: boolean
        transportAnalysis: TransportAnalysis
        rampartPos: RoomPosition
        manualTargetId: string
        manualTargetHits: number
    };

    /**
     * Spawns a creep to build construction and repair walls. Construction will take priority over walls
     * @param operation
     * @param name
     * @param potency
     * @param allowSpawn
     */
    constructor(operation: Operation) {
        super(operation, "builder");
    }

    initMission() {
        if (this.room !== this.spawnGroup.room) {
            this.remoteSpawn = true;
        }

        if (Game.time % 10 === 5) {
            // this should be a little more cpu-friendly since it basically will only run in room that has construction
            let constructionSites = this.room.find(FIND_MY_CONSTRUCTION_SITES) as ConstructionSite[];
            for (let site of constructionSites) {
                if (site.structureType === STRUCTURE_RAMPART || site.structureType === STRUCTURE_WALL) {
                    this.memory.maxHitsToBuild = 2000;
                    break;
                }
            }
        }

        if (!this.memory.maxHitsToBuild) this.memory.maxHitsToBuild = 2000;
        this.sites = this.room.find<ConstructionSite>(FIND_MY_CONSTRUCTION_SITES);
    }

    roleCall() {

        let maxBuilders = 0;
        let potency = 0;
        if (this.room.find(FIND_MY_CONSTRUCTION_SITES).length > 0) {
            maxBuilders = 1;
            potency = this.findBuilderPotency();
            if (this.room.storage && this.room.storage.store.energy < 50000) {
                potency = 1;
            }
        }

        let distance = 20;
        if (this.room.storage) {
            distance = 10;
        }

        let analysis = this.analyzeTransport(distance, potency * 5);

        let builderBody = () => {
            if (this.spawnGroup.maxSpawnEnergy < 550) {
                return this.bodyRatio(1, 3, .5, 1, potency)
            }

            let potencyCost = potency * 100 + Math.ceil(potency / 2) * 50;
            let energyForCarry = this.spawnGroup.maxSpawnEnergy - potencyCost;
            let cartCarryCount = Math.floor((analysis.body.length * 2) / 3);
            let carryCount = Math.min(Math.floor(energyForCarry / 50), cartCarryCount);

            return this.workerBody(potency, carryCount, Math.ceil(potency / 2))
        };

        let builderMemory;
        if (this.memory.activateBoost) {
            builderMemory = {
                scavanger: RESOURCE_ENERGY,
                boosts: [RESOURCE_CATALYZED_LEMERGIUM_ACID],
                allowUnboosted: true
            };
        }
        else {
            builderMemory = { scavanger: RESOURCE_ENERGY };
        }

        this.builders = this.headCount(this.name, builderBody, maxBuilders, {prespawn: 10, memory: builderMemory, moveToRoom: true});
        this.builders = _.sortBy(this.builders, (c: Creep) => c.carry.energy);

        let cartMemory = {
            scavanger: RESOURCE_ENERGY
        };
        this.supplyCarts = this.headCount(this.name + "Cart", () => analysis.body, analysis.cartsNeeded,
            {prespawn: analysis.distance, memory: cartMemory, moveToRoom: true});
    }

    missionActions() {
        for (let builder of this.builders) {
            this.builderActions(builder);
        }

        for (let cart of this.supplyCarts) {
            this.builderCartActions(cart);
        }
    }

    finalizeMission() {
    }

    invalidateMissionCache() {
        this.memory.transportAnalysis = undefined;
        if (Math.random() < 0.01) this.memory.maxHitsToBuild = undefined;
    }

    private builderActions(builder: Creep) {
        let hasLoad = _.filter(this.supplyCarts, (c: Creep) => !c.spawning).length > 0 || this.hasLoad(builder);
        if (!hasLoad) {
            this.procureEnergy(builder);
            return;
        }

        // repair the rampart you just built
        if (this.memory.rampartPos) {
            let rampart = helper.deserializeRoomPosition(this.memory.rampartPos).lookForStructure(STRUCTURE_RAMPART);
            if (rampart && rampart.hits < 10000) {
                if (rampart.pos.inRangeTo(builder, 3)) {
                    builder.repair(rampart);
                }
                else {
                    builder.blindMoveTo(rampart);
                }
                return;
            }
            else {
                this.memory.rampartPos = undefined;
            }
        }

        // has energy
        let closest;
        if (this.name !== "mason") {

            let sites = builder.room.find<ConstructionSite>(FIND_MY_CONSTRUCTION_SITES);
            let priority = _.filter(sites, s => this.priorityStructures.indexOf(s.structureType) >= 0);
            if (priority.length) {
                closest = builder.pos.findClosestByRange(priority);
            } else {
                closest = builder.pos.findClosestByRange<ConstructionSite>(FIND_MY_CONSTRUCTION_SITES);
            }

        }

        if (!closest) {
            this.buildWalls(builder);
            return;
        }

        // has target
        let range = builder.pos.getRangeTo(closest);
        if (range <= 3) {
            let outcome = builder.build(closest);
            if (outcome === OK) {
                builder.yieldRoad(closest);
            }
            if (outcome === OK && closest.structureType === STRUCTURE_RAMPART) {
                this.memory.rampartPos = closest.pos;
            }

            if (range === 0) {
                builder.blindMoveTo(this.flag);
            }
        }
        else {
            builder.blindMoveTo(closest, {maxRooms: 1});
        }
    }

    private buildWalls(builder: Creep) {
        let target = this.findMasonTarget(builder);
        if (!target) {
            if (builder.room.controller && builder.room.controller.level < 8) {
                this.upgradeController(builder);
            }
            else {
                builder.idleOffRoad(this.flag);
            }
            return;
        }

        if (builder.pos.inRangeTo(target, 3)) {
            let outcome = builder.repair(target);
            if (outcome === OK) {
                builder.yieldRoad(target);
            }
        }
        else {
            builder.blindMoveTo(target);
        }
    }

    private findMasonTarget(builder: Creep): Structure {
        let manualTarget = this.findManualTarget();
        if (manualTarget) return manualTarget;

        if (this.room.hostiles.length > 0 && this.room.hostiles[0].owner.username !== "Invader") {
            if (!this.walls) {
                this.walls = _(this.room.findStructures(STRUCTURE_RAMPART).concat(this.room.findStructures(STRUCTURE_WALL)))
                    .sortBy("hits")
                    .value() as StructureRampart[];
            }
            let lowest = this.walls[0];
            _.pull(this.walls, lowest);
            if (builder.memory.emergencyRepairId) {
                let structure = Game.getObjectById(builder.memory.emergencyRepairId) as StructureRampart;
                if (structure && !builder.pos.inRangeTo(lowest, 3)) {
                    return structure;
                }
                else {
                    builder.memory.emergencyRepairId = undefined;
                }
            }
            return lowest;
        }

        if (builder.memory.wallId) {
            let wall = Game.getObjectById(builder.memory.wallId) as Structure;
            if (wall && wall.hits < this.memory.maxHitsToBuild) {
                return wall;
            }
            else {
                builder.memory.wallId = undefined;
                return this.findMasonTarget(builder);
            }
        }
        else {
            // look for ramparts under maxHitsToBuild
            let structures = _.filter(this.room.findStructures(STRUCTURE_RAMPART),
                (s: Structure) => s.hits < this.memory.maxHitsToBuild * .9);
            // look for walls under maxHitsToBuild
            if (structures.length === 0) {
                structures = _.filter(this.room.findStructures(STRUCTURE_WALL),
                    (s: Structure) => s.hits < this.memory.maxHitsToBuild * .9);
            }

            if (structures.length === 0) {
                // increase maxHitsToBuild if there are walls/ramparts in room and re-call function
                if (this.room.findStructures(STRUCTURE_RAMPART).concat(this.room.findStructures(STRUCTURE_WALL)).length > 0) {
                    // TODO: seems to produce some pretty uneven walls, find out why
                    this.memory.maxHitsToBuild += Math.pow(10, Math.floor(Math.log(this.memory.maxHitsToBuild) / Math.log(10)));
                    return this.findMasonTarget(builder);
                }
                // do nothing if there are no walls/ramparts in room
            }

            let closest = builder.pos.findClosestByRange(structures) as Structure;
            if (closest) {
                builder.memory.wallId = closest.id;
                return closest;
            }
        }
    }

    private findManualTarget() {
        if (this.memory.manualTargetId) {
            let target = Game.getObjectById(this.memory.manualTargetId) as Structure;
            if (target && target.hits < this.memory.manualTargetHits) {
                return target;
            }
            else {
                this.memory.manualTargetId = undefined;
                this.memory.manualTargetHits = undefined;
            }
        }
    }

    private upgradeController(builder: Creep) {
        if (builder.pos.inRangeTo(builder.room.controller, 3)) {
            builder.upgradeController(builder.room.controller);
            builder.yieldRoad(builder.room.controller);
        }
        else {
            builder.blindMoveTo(builder.room.controller);
        }
    }

    private findBuilderPotency() {
        let potency = 1;
        if (this.room.storage) {
            potency = Math.min(Math.floor(this.room.storage.store.energy / 7500), 10)
        }
        else {
            potency = this.room.find(FIND_SOURCES).length * 2
        }

        return potency;
    }

    private builderCartActions(cart: Creep) {

        let suppliedCreep = _.head(this.builders);
        if (!suppliedCreep) {
            cart.idleOffRoad(this.flag);
            return;
        }

        let hasLoad = this.hasLoad(cart);
        if (!hasLoad) {
            this.procureEnergy(cart, suppliedCreep);
            return;
        }

        let rangeToBuilder = cart.pos.getRangeTo(suppliedCreep);
        if (rangeToBuilder > 3) {
            cart.blindMoveTo(suppliedCreep);
            return;
        }

        let overCapacity = cart.carry.energy > suppliedCreep.carryCapacity - suppliedCreep.carry.energy
        if (suppliedCreep.carry.energy > suppliedCreep.carryCapacity * .5 && overCapacity) {
            cart.yieldRoad(suppliedCreep);
            return;
        }

        if (rangeToBuilder > 1) {
            cart.blindMoveTo(suppliedCreep);
            return;
        }

        cart.transfer(suppliedCreep, RESOURCE_ENERGY);
        if (!overCapacity && this.room.storage) {
            cart.blindMoveTo(this.room.storage)
        }
    }
}
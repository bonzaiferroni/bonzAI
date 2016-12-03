import {Mission} from "./Mission";
import {Operation} from "./Operation";
import {helper} from "./helper";
import {TransportAnalysis} from "./interfaces";
export class BuildMission extends Mission {

    builders: Creep[];
    supplyCarts: Creep[];
    potency: number;
    sites: ConstructionSite[];
    walls: StructureRampart[];

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
    constructor(operation: Operation, name: string, potency: number, allowSpawn: boolean = true) {
        super(operation, name, allowSpawn);
        this.potency = potency;
    }

    initMission() {
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
        let builderBody = () => {
            let potency = this.potency;
            if (this.room.storage && this.room.storage.store.energy < 50000) {
                potency = 1;
            }
            return this.workerBody(potency, potency, potency / 2);
        };
        let maxBuilders = 1;

        if (this.name === "mason" && this.room.hostiles.length > 0 && this.room.hostiles[0].owner.username !== "Invader") {
            maxBuilders = 2;
        }

        if (this.memory.max !== undefined) {
            maxBuilders = this.memory.max;
        }

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

        this.builders = this.headCount(this.name, builderBody, maxBuilders, {prespawn: 10, memory: builderMemory});
        this.builders = _.sortBy(this.builders, (c: Creep) => c.carry.energy);

        // I used the distance value 10 here because ~10 is the average distance to structures in the room
        let cartMemory = {
            scavanger: RESOURCE_ENERGY
        };
        let analysis = this.analyzeTransport(20, this.potency * maxBuilders * 5);
        this.supplyCarts = this.headCount(this.name + "Cart", () => analysis.body, analysis.cartsNeeded,
            {prespawn: analysis.distance, memory: cartMemory});
    }

    missionActions() {
        for (let builder of this.builders) {
            this.builderActions(builder);
        }

        for (let cart of this.supplyCarts) {
            this.supplyCartActions(cart, _.head(this.builders));
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
            closest = builder.pos.findClosestByRange(FIND_MY_CONSTRUCTION_SITES) as ConstructionSite;
        }

        if (!closest) {
            this.buildWalls(builder);
            return;
        }

        // has target
        if (builder.pos.inRangeTo(closest, 3)) {
            let outcome = builder.build(closest);
            if (outcome === OK) {
                builder.yieldRoad(closest);
            }
            if (outcome === OK && closest.structureType === STRUCTURE_RAMPART) {
                this.memory.rampartPos = closest.pos;
            }
        }
        else {
            builder.blindMoveTo(closest);
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
}
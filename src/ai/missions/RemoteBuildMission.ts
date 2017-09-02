import {Mission} from "./Mission";
import {Operation} from "../operations/Operation";
import {Agent} from "../agents/Agent";
import {ProcureEnergyOptions} from "../agents/interfaces";
import {helper} from "../../helpers/helper";
export class RemoteBuildMission extends Mission {

    private builders: Agent[];
    private construction: ConstructionSite[];
    private recycleWhenDone: boolean;

    /**
     * Builds construction in remote locations, can recycle self when finished
     * @param operation
     * @param recycleWhenDone - recycles creep in spawnroom if there are no available construction sites
     * @param allowSpawn
     */

    constructor(operation: Operation, recycleWhenDone: boolean, allowSpawn = true) {
        super(operation, "remoteBuild");
        this.recycleWhenDone = recycleWhenDone;
        this.allowSpawn = allowSpawn;
    }

    public init() {
        if (!this.allowSpawn) {
            this.operation.removeMission(this);
        }
    }

    public update() {
        if (!this.state.hasVision) { return; }
        this.construction = _(this.room.find<ConstructionSite>(FIND_MY_CONSTRUCTION_SITES))
            .filter(x => x.structureType !== STRUCTURE_ROAD)
            .value();
    }

    public roleCall() {
        let maxBuilders = () => this.construction && this.construction.length > 0 ? 1 : 0;
        let getBody = () => {
            return this.workerUnitBody(1, 1, 1, 10);
        };
        let memory;
        if (this.memory.activateBoost) {
            memory = { boosts: [RESOURCE_CATALYZED_LEMERGIUM_ACID], allowUnboosted: true};
        }
        this.builders = this.headCount("remoteBuilder", getBody, maxBuilders, {memory: memory});
    }

    public actions() {
        for (let builder of this.builders) {
            if (!this.waypoints && this.recycleWhenDone && this.construction.length === 0) {
                this.recycleBuilder(builder);
            } else {
                this.builderActions(builder);
            }
        }
    }

    public finalize() {
    }

    public invalidateCache() {
    }

    private builderActions(builder: Agent) {

        let fleeing = builder.fleeHostiles();
        if (fleeing) { return; } // early

        if (!this.state.hasVision) {
            if (!builder.pos.isNearTo(this.flag)) {
                builder.travelTo(this.flag);
            }
            return; // early
        }

        builder.stealNearby("creep");

        let hasLoad = builder.hasLoad();
        if (!hasLoad) {
            let options: ProcureEnergyOptions = {
                highPriority: true,
                getFromSource: true,
            };
            builder.procureEnergy(options);
            return; // early
        }

        // repair the rampart you just built
        if (builder.memory.rampartPos) {
            let rampart = helper.deserializeRoomPosition(builder.memory.rampartPos).lookForStructure(STRUCTURE_RAMPART);
            if (rampart && rampart.hits < 100000) {
                if (rampart.pos.inRangeTo(builder, 3)) {
                    builder.repair(rampart);
                } else {
                    builder.travelTo(rampart);
                }
                return;
            } else {
                builder.memory.rampartPos = undefined;
            }
        }

        let closest = this.findConstruction(builder);
        if (!closest) {
            builder.idleNear(this.flag);
            return; // early
        }

        if (builder.pos.inRangeTo(closest, 3)) {
            let outcome = builder.build(closest);
            builder.yieldRoad(closest);

            if (outcome === OK && closest.structureType === STRUCTURE_RAMPART) {
                builder.memory.rampartPos = closest.pos;
            }
        } else {
            builder.travelTo(closest);
        }
    }

    private recycleBuilder(builder: Agent) {
        let spawn = this.spawnGroup.spawns[0];
        if (builder.carry.energy > 0 && spawn.room.storage) {
            if (builder.pos.isNearTo(spawn.room.storage)) {
                builder.transfer(spawn.room.storage, RESOURCE_ENERGY);
            } else {
                builder.travelTo(spawn.room.storage);
            }
        } else {
            if (builder.pos.isNearTo(spawn)) {
                spawn.recycleCreep(builder.creep);
            } else {
                builder.travelTo(spawn);
            }
        }
    }

    private findConstruction(builder: Agent): ConstructionSite {
        if (builder.memory.siteId) {
            let site = Game.getObjectById<ConstructionSite>(builder.memory.siteId);
            if (site) {
                return site;
            } else {
                delete builder.memory.siteId;
                return this.findConstruction(builder);
            }
        } else {
            let site = builder.pos.findClosestByRange<ConstructionSite>(this.construction);
            if (site) {
                builder.memory.siteId = site.id;
                return site;
            }
        }
    }
}

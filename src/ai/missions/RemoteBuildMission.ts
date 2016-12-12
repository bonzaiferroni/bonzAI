import {Mission} from "./Mission";
import {Operation} from "../operations/Operation";
export class RemoteBuildMission extends Mission {

    builders: Creep[];
    construction: ConstructionSite[];
    recycleWhenDone: boolean;
    private boost: boolean;

    /**
     * Builds construction in remote locations, can recycle self when finished
     * @param operation
     * @param recycleWhenDone - recycles creep in spawnroom if there are no available construction sites
     * @param boost
     */

    constructor(operation: Operation, recycleWhenDone: boolean) {
        super(operation, "remoteBuild");
        this.recycleWhenDone = recycleWhenDone;
    }

    initMission() {
        if (!this.hasVision) {
            return; // early
        }

        this.construction = this.room.find<ConstructionSite>(FIND_MY_CONSTRUCTION_SITES);
    }

    roleCall() {
        let maxBuilders = this.construction && this.construction.length > 0 ? 1 : 0;
        let getBody = () => {
            if (this.memory.activateBoost) {
                return this.workerBody(16, 16, 16);
            }
            return this.bodyRatio(1, 1, 1, .8, 10);
        };
        let memory;
        if (this.memory.activateBoost) {
            memory = { boosts: [RESOURCE_CATALYZED_LEMERGIUM_ACID], allowUnboosted: true};
        }
        this.builders = this.headCount("remoteBuilder", getBody, maxBuilders, {memory: memory});
    }

    missionActions() {
        for (let builder of this.builders) {
            if (!this.waypoints && this.recycleWhenDone && this.construction.length === 0) {
                this.recycleBuilder(builder);
            }
            else {
                this.builderActions(builder);
            }
        }
    }

    finalizeMission() {
    }

    invalidateMissionCache() {
    }

    private builderActions(builder: Creep) {

        let fleeing = builder.fleeHostiles();
        if (fleeing) return; // early

        if (!this.hasVision) {
            if (!builder.pos.isNearTo(this.flag)) {
                builder.blindMoveTo(this.flag);
            }
            return; // early
        }

        if (builder.room !== this.room) {
            builder.blindMoveTo(this.flag);
            return; // early
        }

        let hasLoad = this.hasLoad(builder);
        if (!hasLoad) {
            this.procureEnergy(builder, undefined, true, true);
            return; // early
        }

        let closest = builder.pos.findClosestByRange(this.construction);
        if (!closest) {
            if (!builder.pos.isNearTo(this.flag)) {
                builder.blindMoveTo(this.flag);
            }
            return; // early
        }

        if (builder.pos.inRangeTo(closest, 3)) {
            builder.build(closest);
            builder.yieldRoad(closest);
        }
        else {
            builder.blindMoveTo(closest, { maxRooms: 1 });
        }
    }

    private recycleBuilder(builder: Creep) {
        let spawn = this.spawnGroup.spawns[0];
        if (builder.carry.energy > 0 && spawn.room.storage) {
            if (builder.pos.isNearTo(spawn.room.storage)) {
                builder.transfer(spawn.room.storage, RESOURCE_ENERGY);
            }
            else {
                builder.blindMoveTo(spawn.room.storage);
            }
        }
        else {
            let spawn = this.spawnGroup.spawns[0];
            if (builder.pos.isNearTo(spawn)) {
                spawn.recycleCreep(builder);
            }
            else {
                builder.blindMoveTo(spawn);
            }
        }
    }
}
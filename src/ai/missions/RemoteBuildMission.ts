import {Mission} from "./Mission";
import {Operation} from "../operations/Operation";
import {Agent} from "./Agent";
export class RemoteBuildMission extends Mission {

    builders: Agent[];
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
        let maxBuilders = () => this.construction && this.construction.length > 0 ? 1 : 0;
        let getBody = () => {
            return this.bodyRatio(1, 1, 1, .8, 10);
        };
        let memory;
        if (this.memory.activateBoost || (this.room.controller && this.room.controller.my)) {
            memory = { boosts: [RESOURCE_CATALYZED_LEMERGIUM_ACID], allowUnboosted: true};
        }
        this.builders = this.headCount2("remoteBuilder", getBody, maxBuilders, {memory: memory});
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

    private builderActions(builder: Agent) {

        let fleeing = builder.fleeHostiles();
        if (fleeing) return; // early

        if (!this.hasVision) {
            if (!builder.pos.isNearTo(this.flag)) {
                builder.travelTo(this.flag);
            }
            return; // early
        }

        builder.stealNearby("creep");

        let hasLoad = builder.hasLoad();
        if (!hasLoad) {
            builder.procureEnergy(undefined, true, true);
            return; // early
        }

        let closest = this.findConstruction(builder);
        if (!closest) {
            builder.idleNear(this.flag);
            return; // early
        }

        if (builder.pos.inRangeTo(closest, 3)) {
            builder.build(closest);
            builder.yieldRoad(closest);
        }
        else {
            builder.travelTo(closest);
        }
    }

    private recycleBuilder(builder: Agent) {
        let spawn = this.spawnGroup.spawns[0];
        if (builder.carry.energy > 0 && spawn.room.storage) {
            if (builder.pos.isNearTo(spawn.room.storage)) {
                builder.transfer(spawn.room.storage, RESOURCE_ENERGY);
            }
            else {
                builder.travelTo(spawn.room.storage);
            }
        }
        else {
            let spawn = this.spawnGroup.spawns[0];
            if (builder.pos.isNearTo(spawn)) {
                spawn.recycleCreep(builder.creep);
            }
            else {
                builder.travelTo(spawn);
            }
        }
    }

    private findConstruction(builder: Agent): ConstructionSite {
        if (builder.memory.siteId) {
            let site = Game.getObjectById<ConstructionSite>(builder.memory.siteId)
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
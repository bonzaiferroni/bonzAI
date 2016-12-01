import {Mission} from "./Mission";
import {Operation} from "./Operation";
export class DemolishMission extends Mission {

    demolishers: Creep[];
    scavangers: Creep[];

    demoFlags: Flag[] = [];
    demoStructures: Structure[] = [];
    potency: number;
    storeStructure: StructureContainer|StructureStorage|StructureTerminal;

    /**
     * Spawn a demolisher when there are flags that match his pattern ("Flag + n"), he will visit those flags and remove the
     * structures underneath. This pattern happens to be the default flag pattern used by the game UI, be careful
     * @param operation
     * @param potency
     * @param storeStructure When a storeStructure is provided, it will spawn a scavanger to deliver energy
     * @param allowSpawn
     */

    constructor(operation: Operation, potency = 25,
                storeStructure: StructureContainer|StructureStorage|StructureTerminal, allowSpawn = true) {
        super(operation, "demolish", allowSpawn);
        this.potency = potency;
        this.storeStructure = storeStructure;
    }

    initMission() {

        for (let i = 0; i <= 50; i++ ) {
            let flag = Game.flags["Flag" + i];
            if (!flag) continue;
            this.demoFlags.push(flag);
            if (!flag.room) continue;
            let structure = flag.pos.lookFor<Structure>(LOOK_STRUCTURES)[0];
            if (structure) {
                this.demoStructures.push(structure);
            }
            else {
                flag.remove();
            }
        }
    }

    roleCall() {

        let max = this.demoFlags.length > 0 ? 1 : 0;
        let potency = Math.min(this.potency, 25);

        this.demolishers = this.headCount("demolisher", () => this.workerBody(potency, 0, potency), max);

        let maxScavangers = max > 0 && this.storeStructure ? 1 : 0;
        this.scavangers = this.headCount("scavanger", () => this.workerBody(0, this.potency, this.potency), maxScavangers);
    }

    missionActions() {
        for (let demolisher of this.demolishers) {
            this.demolisherActions(demolisher);
        }

        for (let scavanger of this.scavangers) {
            this.scavangerActions(scavanger, _.head(this.demolishers));
        }
    }

    finalizeMission() {
    }

    invalidateMissionCache() {
    }

    private demolisherActions(demolisher: Creep) {
        let structure = _.head(this.demoStructures);
        if (structure) {
            if (demolisher.pos.isNearTo(structure)) {
                demolisher.dismantle(structure);
            }
            else {
                demolisher.blindMoveTo(structure);
            }
            return;
        }

        let flag = _.head(this.demoFlags);
        if (flag) {
            demolisher.blindMoveTo(flag);
            return;
        }

        demolisher.idleOffRoad(this.flag);
    }

    private scavangerActions(scavanger: Creep, demolisher: Creep) {

        if (!demolisher) {
            if (this.demoFlags.length > 0) {
                scavanger.blindMoveTo(this.demoFlags[0]);
            }
            else {
                this.moveToFlag(scavanger);
            }
            return;
        }

        let hasLoad = this.hasLoad(scavanger);
        if (!hasLoad) {

            if (scavanger.room !== demolisher.room) {
                scavanger.blindMoveTo(demolisher);
                return; // early
            }

            let resource = this.findScavangerResource(scavanger, demolisher);
            if (resource) {
                if (scavanger.pos.isNearTo(resource)) {
                    scavanger.pickup(resource);
                }
                else {
                    scavanger.blindMoveTo(resource);
                }
            }
            else {
                scavanger.blindMoveTo(demolisher);
            }
            return; // early
        }

        if (_.sum(this.storeStructure.store) === this.storeStructure.storeCapacity) {
            scavanger.idleOffRoad(demolisher);
            return; // early
        }

        if (scavanger.pos.isNearTo(this.storeStructure)) {
            scavanger.transfer(this.storeStructure, RESOURCE_ENERGY);
            scavanger.memory.resourceId = undefined;
        }
        else {
            scavanger.blindMoveTo(this.storeStructure);
        }

    }

    private findScavangerResource(scavanger: Creep, demolisher: Creep): Resource {
        if (scavanger.memory.resourceId) {
            let resource = Game.getObjectById(scavanger.memory.resourceId) as Resource;
            if (resource) {
                return resource;
            }
            else {
                scavanger.memory.resourceId = undefined;
                return this.findScavangerResource(scavanger, demolisher);
            }
        }
        else {
            let resources = _.filter(demolisher.room.find(FIND_DROPPED_RESOURCES),
                (r: Resource) => r.resourceType === RESOURCE_ENERGY );
            let closest = scavanger.pos.findClosestByRange(resources) as Resource;
            if (closest) {
                scavanger.memory.resourceId = closest.id;
                return closest;
            }
        }
    }
}
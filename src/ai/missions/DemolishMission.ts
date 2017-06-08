import {Mission} from "./Mission";
import {Operation} from "../operations/Operation";
import {Agent} from "../agents/Agent";
export class DemolishMission extends Mission {

    private demolishers: Agent[];
    private scavangers: Agent[];

    private demoFlags: Flag[] = [];
    private demoStructures: Structure[];
    private storeStructure: StructureContainer|StructureStorage|StructureTerminal;

    /**
     * Spawn a demolisher when there are flags that match his pattern ("Flag + n"), he will visit those flags and remove
     * structures underneath. This pattern happens to be the default flag pattern used by the game UI, be careful
     * @param operation
     * @param potency
     * @param storeStructure When a storeStructure is provided, it will spawn a scavenger to deliver energy
     * @param allowSpawn
     */

    constructor(operation: Operation) {
        super(operation, "demolish");
    }

    public init() {
    }

    public update() {
        this.demoStructures = [];

        for (let i = 0; i <= 50; i++ ) {
            let flag = Game.flags["Flag" + i];
            if (!flag) { continue; }
            this.demoFlags.push(flag);
            if (!flag.room) { continue; }
            let structure = flag.pos.lookFor<Structure>(LOOK_STRUCTURES)[0];
            if (structure) {
                this.demoStructures.push(structure);
            } else {
                flag.remove();
            }
        }

        this.storeStructure = this.checkStoreStructure();
    }

    private getMaxDemolishers = () => {
        if (this.demoFlags.length === 0) { return 0; }
        if (this.memory.max !== undefined) { return this.memory.max; }
        return 1;
    };
    private getMaxScavengers = () => this.demoFlags.length > 0 && this.storeStructure ? 1 : 0;

    public roleCall() {

        this.demolishers = this.headCount("demolisher", () => this.bodyRatio(1, 0, 1, 1), this.getMaxDemolishers);
        this.scavangers = this.headCount("scavenger", () => this.bodyRatio(0, 1, 1, 1), this.getMaxScavengers);
    }

    public actions() {
        for (let demolisher of this.demolishers) {
            this.demolisherActions(demolisher);
        }

        for (let scavenger of this.scavangers) {
            this.scavengerActions(scavenger, _.head(this.demolishers));
        }
    }

    public finalize() {
    }

    public invalidateCache() {
    }

    private demolisherActions(demolisher: Agent) {
        let structure = _.head(this.demoStructures);
        if (structure) {
            if (demolisher.pos.isNearTo(structure)) {
                demolisher.dismantle(structure);
            } else {
                demolisher.travelTo(structure);
            }
            return;
        }

        let flag = _.head(this.demoFlags);
        if (flag) {
            demolisher.travelTo(flag);
            return;
        }

        demolisher.idleOffRoad(this.flag);
    }

    private scavengerActions(scavenger: Agent, demolisher: Agent) {

        if (!demolisher || scavenger.room !== demolisher.room) {
            if (this.demoFlags.length > 0) {
                scavenger.travelTo(this.demoFlags[0]);
            } else {
                scavenger.idleOffRoad();
            }
            return;
        }

        let hasLoad = scavenger.hasLoad();
        if (!hasLoad) {

            let resource = this.findScavangerResource(scavenger, demolisher);
            if (resource) {
                if (scavenger.pos.isNearTo(resource)) {
                    scavenger.pickup(resource);
                } else {
                    scavenger.travelTo(resource);
                }
            } else {
                scavenger.travelTo(demolisher);
            }
            return; // early
        }

        if (_.sum(this.storeStructure.store) === this.storeStructure.storeCapacity) {
            scavenger.idleOffRoad(demolisher);
            return; // early
        }

        if (scavenger.pos.isNearTo(this.storeStructure)) {
            scavenger.transfer(this.storeStructure, RESOURCE_ENERGY);
            scavenger.memory.resourceId = undefined;
        } else {
            scavenger.travelTo(this.storeStructure);
        }

    }

    private findScavangerResource(scavenger: Agent, demolisher: Agent): Resource {
        if (scavenger.memory.resourceId) {
            let resource = Game.getObjectById(scavenger.memory.resourceId) as Resource;
            if (resource) {
                return resource;
            } else {
                scavenger.memory.resourceId = undefined;
                return this.findScavangerResource(scavenger, demolisher);
            }
        } else {
            let resources = _.filter(demolisher.room.find(FIND_DROPPED_RESOURCES),
                (r: Resource) => r.resourceType === RESOURCE_ENERGY );
            let closest = scavenger.pos.findClosestByRange(resources) as Resource;
            if (closest) {
                scavenger.memory.resourceId = closest.id;
                return closest;
            }
        }
    }

    private checkStoreStructure(): StructureContainer | StructureStorage | StructureTerminal {

        let flag = Game.flags[`${this.operation.name}_store`];
        if (flag && flag.room) {
            let storeStructure = _(flag.pos.lookFor(LOOK_STRUCTURES))
                .filter((s: any) => s.store !== undefined)
                .head() as StructureContainer | StructureStorage | StructureTerminal;
            if (storeStructure) { return storeStructure; }
        }
    }
}

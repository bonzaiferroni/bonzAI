import {BuilderMemory, BuilderMission} from "./BuilderMission";
import {Agent} from "../agents/Agent";
import {MemHelper} from "../../helpers/MemHelper";
import {Operation} from "../operations/Operation";

export interface BootstrapBuilderMissionMemory extends BuilderMemory {
    containerId: string;
    nextBuilder: number;
}

export class BootstrapBuilderMission extends BuilderMission {

    public memory: BootstrapBuilderMissionMemory;
    private container: StructureContainer;

    protected maxCarts = () => {
        return 0;
    };

    protected maxBuilders = () => {
        if (this.memory.nextBuilder > Game.time) {
            return 0;
        } else {
            if (this.sites.length > 0) {
                return 4;
            } else {
                return 10;
            }
        }
    };

    protected builderBody = () => {
        let potency = this.findBuilderPotency();
        return this.workerUnitBody(1, 1, .5, potency);
    };

    public roleCall() {
        super.roleCall();
        if (this.spawnedThisTick("builder")) {
            this.memory.nextBuilder = Game.time + 50;
        }
    }

    protected findConstructionSites() {
        return _.filter(this.room.find<ConstructionSite>(FIND_MY_CONSTRUCTION_SITES), x => {
            if (x.structureType === STRUCTURE_ROAD) {
                return this.room.controller.level > 2 ||
                    (this.room.controller.level > 1 && this.room.controller.pos.getRangeTo(x) <= 3);
            } else if (x.structureType === STRUCTURE_CONTAINER) {
                return this.room.controller.level > 1 && this.room.controller.pos.getRangeTo(x) <= 3;
            } else {
                return true;
            }
        });
    }

    protected builderActions(builder: Agent) {

        let target: ConstructionSite|StructureController = this.findBuilderTarget(builder);

        // has target
        builder.memory.deliverTo = false;
        let range = builder.pos.getRangeTo(target);
        if (builder.fatigue > 0 && range > 10) {
            builder.drop(RESOURCE_ENERGY);
        }

        if (target instanceof ConstructionSite) {
            if (range <= 3) {
                builder.memory.deliverTo = true;
                let outcome = builder.build(target);
                builder.idleNear(target, 3)
                // standing on top of target
                if (range === 0) {
                    builder.travelTo(this.flag);
                }
            } else {
                builder.travelTo(target, { range: 3});
            }
            return;
        }

        if (range <= 3) {
            builder.memory.deliverTo = true;
        }

        // upgrading
        let openPos = this.findOpenPos(builder, range);
        if (openPos) {
            builder.travelTo(openPos, {range: 0});
            if (builder.carryCapacity - builder.sumCarry() > 25) {
                builder.withdraw(this.container, RESOURCE_ENERGY);
            }
        } else {
            builder.idleNear(target, 3);
        }

        builder.upgradeController(target);
    }

    private findOpenPos(builder: Agent, controllerRange: number): RoomPosition {
        if (!this.memory.containerId) {
            let container = _.find(this.room.findStructures<StructureContainer>(STRUCTURE_CONTAINER),
                x => x.pos.getRangeTo(this.room.controller) <= 3);
            if (container) {
                this.memory.containerId = container.id;
            } else {
                return;
            }
        }

        this.container = Game.getObjectById<StructureContainer>(this.memory.containerId);
        if (!this.container) {
            this.memory.containerId = undefined;
            return;
        }

        let posClear = (pos: RoomPosition) => {
            let road = pos.lookForStructure(STRUCTURE_ROAD);
            let site = pos.lookFor(LOOK_CONSTRUCTION_SITES)[0];
            return !road && !site;
        };

        if (builder.pos.isNearTo(this.container) && controllerRange <= 3 && posClear(builder.pos)) {
            return builder.pos;
        }

        let positions = this.container.pos.openAdjacentSpots();
        let creep = this.container.pos.lookFor(LOOK_CREEPS)[0];
        if (!creep) {
            positions.push(this.container.pos);
        }

        positions = _.filter(positions, x => posClear(x));

        let position = builder.pos.findClosestByRange(positions);
        if (position) {
            return position;
        }
    }
}
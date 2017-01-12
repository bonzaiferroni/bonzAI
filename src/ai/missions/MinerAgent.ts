import {Agent} from "./Agent";
export class MinerAgent extends Agent {

    dropEnergy() {
        if (this.creep.carry.energy > 0) {
            this.creep.drop(RESOURCE_ENERGY);
        }
    }

    buildContainer(source: Source, reserveEnergy: boolean) {
        if (this.creep.pos.isNearTo(source)) {
            if (this.creep.carry.energy < this.creep.carryCapacity || reserveEnergy) {
                this.creep.harvest(source);
            }
            else {
                let construction = source.pos.findInRange<ConstructionSite>(FIND_CONSTRUCTION_SITES, 1)[0];
                if (construction) {
                    this.creep.build(construction);
                }
            }
        }
        else {
            this.travelTo(source);
        }
    }

    leadMinerActions(source: Source, container: StructureContainer) {
        if (this.pos.inRangeTo(container, 0)) {
            if (container.hits < container.hitsMax * .90 && this.creep.carry.energy >= 20) {
                this.creep.repair(container);
            }
            else if (container.store.energy < container.storeCapacity) {
                this.creep.harvest(source);
            }
        }
        else {
            this.travelTo(container);
        }
    }

    replaceCurrentMiner(container: StructureContainer) {
        if (this.pos.isNearTo(container)) {
            this.moveItOrLoseIt(container.pos, "miner");
        }
        else {
            this.travelTo(container);
        }
    }

    backupMinerActions(source: Source, container: StructureContainer) {
        if (!this.pos.isNearTo(source) || !this.pos.isNearTo(container)) {
            let position = _.filter(container.pos.openAdjacentSpots(), (p: RoomPosition) => p.isNearTo(source))[0];
            if (position) {
                this.travelTo(position);
            }
            else {
                this.idleNear(container, 3);
            }
            return;
        }

        if (container.hits < container.hitsMax * .90 && this.creep.carry.energy >= 20) {
            this.creep.repair(container);
        }
        else {
            this.creep.harvest(source);
        }

        if (this.creep.carry.energy >= 40) {
            this.creep.transfer(container, RESOURCE_ENERGY);
        }
    }
}
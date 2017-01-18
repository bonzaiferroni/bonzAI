import {Mission} from "./Mission";
import {Operation} from "../operations/Operation";
import {Agent} from "./Agent";
export class LairMission extends Mission {

    trappers: Agent[];
    scavengers: Agent[];
    lairs: StructureKeeperLair[];
    targetLair: StructureKeeperLair;
    storeStructure: StructureStorage | StructureContainer | StructureTerminal;

    memory: {
        travelOrder: number[];
    };

    constructor(operation: Operation) {
        super(operation, "lair");
    }

    initMission() {
        if (!this.hasVision) return; // early
        // should be ordered in a preferable travel order
        this.lairs = _.filter(this.room.findStructures<StructureKeeperLair>(STRUCTURE_KEEPER_LAIR),
            (s: Structure) => s.pos.lookFor(LOOK_FLAGS).length === 0) as StructureKeeperLair[];

        if (!this.memory.travelOrder || this.memory.travelOrder.length !== this.lairs.length) {
            // this.memory.travelOrder = this.findTravelOrder(this.lairs);
        }

        this.distanceToSpawn = this.findDistanceToSpawn(this.flag.pos);

        this.assignKeepers();
        this.targetLair = this.findTargetLair();

        if (this.waypoints) {
            let destination = Game.flags[this.operation.name + "_sourceDestination"];
            if (destination) {
                let structure = destination.pos.lookFor(LOOK_STRUCTURES)[0] as StructureStorage;
                if (structure) {
                    this.storeStructure = structure;
                }
            }
        }
        else {
            this.storeStructure = this.spawnGroup.room.storage;
        }
    }

    roleCall() {
        let maxTrappers = () => this.lairs && this.lairs.length > 0 ? 1 : 0;
        this.trappers = this.headCount2("trapper", () => this.configBody({move: 25, attack: 19, heal: 6}), maxTrappers, {
            prespawn: this.distanceToSpawn + 100,
            skipMoveToRoom: true,
        });

        let maxScavengers = () => this.lairs && this.lairs.length >= 3 && this.storeStructure ? 1 : 0;
        let body = () => this.workerBody(0, 33, 17);
        this.scavengers = this.headCount2("scavenger", body, maxScavengers, 50);
    }

    missionActions() {
        for (let trapper of this.trappers) {
            this.trapperActions(trapper);
        }

        for (let scavenger of this.scavengers) {
            this.scavengersActions(scavenger);
        }
    }

    finalizeMission() {
    }

    invalidateMissionCache() {
    }

    private trapperActions(trapper: Agent) {
        if (trapper.pos.roomName !== this.flag.pos.roomName || !this.targetLair) {
            if (trapper.hits < trapper.hitsMax) {
                trapper.heal(trapper);
            }
            trapper.travelTo(this.flag);
            return; // early
        }

        let isAttacking = false;
        let nearestHostile = trapper.pos.findClosestByRange(this.room.hostiles) as Creep;
        if (nearestHostile && trapper.pos.isNearTo(nearestHostile)) {
            isAttacking = trapper.attack(nearestHostile) === OK;
            trapper.move(trapper.pos.getDirectionTo(nearestHostile));
        }

        let keeper = this.targetLair.keeper;
        let range;
        if (keeper) {
            range = trapper.pos.getRangeTo(keeper);
            if (range > 1) {
                trapper.travelTo(keeper);
            }
        }
        else {
            trapper.travelTo(this.targetLair);
        }

        if (!isAttacking && (trapper.hits < trapper.hitsMax || range <= 3)) {
            trapper.heal(trapper);
        }
    }

    private scavengersActions(scavenger: Agent) {

        let fleeing = scavenger.fleeHostiles();
        if (fleeing) return; // early

        let hasLoad = scavenger.hasLoad();
        if (hasLoad) {
            let storage = this.storeStructure;
            if (scavenger.pos.isNearTo(storage)) {
                scavenger.transfer(storage, RESOURCE_ENERGY);
                scavenger.travelTo(this.flag);
            } else {
                scavenger.travelTo(storage);
            }
            return;
        }

        if (scavenger.room.name !== this.flag.pos.roomName) {
            scavenger.idleNear(this.flag);
            return; // early;
        }

        let closest = this.findDroppedEnergy(scavenger);
        if (closest) {
            if (scavenger.pos.isNearTo(closest)) {
                scavenger.pickup(closest);
                scavenger.say("yoink!", true);
            } else {
                scavenger.travelTo(closest);
            }
        }
        else {
            scavenger.idleNear(this.flag);
        }
    }

    private assignKeepers() {
        if (!this.lairs) return;
        let lairs = this.room.findStructures(STRUCTURE_KEEPER_LAIR);
        let hostiles = this.room.hostiles;
        for (let hostile of hostiles) {
            if (hostile.owner.username === "Source Keeper") {
                let closestLair = hostile.pos.findClosestByRange(lairs) as StructureKeeperLair;
                if (!_.includes(this.lairs, closestLair)) continue;
                closestLair.keeper = hostile;
            }
        }
    }

    private findTargetLair() {
        if (this.lairs.length > 0) {
            let lowestTicks = Number.MAX_VALUE;
            let lowestLair;
            for (let lair of this.lairs) {
                let lastTicks = 0;
                if (lair.keeper) {
                    return lair;
                }
                else {
                    // if this lair is going to spawn sooner than the last one in the list, return it
                    if (lair.ticksToSpawn < lastTicks) {
                        return lair;
                    }
                    lastTicks = lair.ticksToSpawn;
                    if (lair.ticksToSpawn < lowestTicks) {
                        lowestLair = lair;
                        lowestTicks = lair.ticksToSpawn;
                    }
                }
            }
            return lowestLair;
        }
    }

    private findDroppedEnergy(scavenger: Agent): Resource {
        if (scavenger.memory.resourceId) {
            let resource = Game.getObjectById(scavenger.memory.resourceId) as Resource;
            if (resource) {
                return resource;
            }
            else {
                scavenger.memory.resourceId = undefined;
                return this.findDroppedEnergy(scavenger);
            }
        }
        else {
            let resource = scavenger.pos.findClosestByRange(
                _.filter(this.room.find(FIND_DROPPED_RESOURCES),
                    (r: Resource) => r.amount > 100 && r.resourceType === RESOURCE_ENERGY) as Resource[]);
            if (resource) {
                scavenger.memory.resourceId = resource.id;
                return resource;
            }
        }
    }

    private findTravelOrder(lairs: StructureKeeperLair[]) {

    }
}
/*
import {Mission} from "./Mission";
import {Operation} from "../operations/Operation";
import {Agent} from "./Agent";
import {empire} from "../Empire";
export class GuardMission extends Mission {

    private guards: Agent[];
    private melee: Agent[];

    private guardedFlags: Flag[];
    private potency: number;
    private swampRat: boolean = false;
    private hostiles: Creep[];
    private scaryDudes: Creep[] = [];
    private targetFlags: Flag[];

    public memory: {
        potency: number;
        max: number;
        activateBoost: boolean;
        melee: boolean;
        minPotency: number;
    };

    constructor(operation: Operation) {
        super(operation, "guard");
    }

    public initMission() {
        this.guardedFlags = this.getFlagSet("_guarded_", 10);
        if (!this.memory.potency) { this.memory.potency = 1; }
        this.potency = Math.min(this.memory.potency, 8);
        this.targetFlags = this.getFlagSet("_targets_", 10);
    }

    public maxGuards = () => {
        if (this.guardedFlags.length === 0) { return 0; }
        if (this.memory.max !== undefined) { return this.memory.max; }
        return 1;
    };

    public guardBody = () => {
        if (this.memory.potency > 8) {
            console.log(`GUARD: ${
                this.operation.name} potency is higher than 8, seems to be struggling`);
        }
        if (this.memory.melee) {
            // not supported yet
        } else {
            if (this.memory.minPotency && this.potency < this.memory.minPotency) {
                this.potency = this.memory.minPotency;
            }
            return this.configBody({
                [RANGED_ATTACK]: 2 * this.potency,
                [MOVE]: 3 * this.potency,
                [HEAL]: this.potency,
            });
        }
    };

    public roleCall() {
        let boosts;
        if (this.memory.activateBoost) {
            boosts = [RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE, RESOURCE_CATALYZED_KEANIUM_ALKALIDE];
        }

        this.guards = this.headCount("ranger", this.guardBody, this.maxGuards, {
            prespawn: 50,
            boosts: boosts,
            allowUnboosted: false,
            disableNotify: true,
        });
    }

    public missionActions() {
        for (let guard of this.guards) {
            if (guard.partCount(RANGED_ATTACK) > 0) {
                this.rangerActions(guard);
            }
            else {
                this.meleeActions(guard);
            }
        }
    }

    public finalizeMission() {
        if (!this.memory.ticksToLive) this.memory.ticksToLive = {};
        for (let guard of this.guards) {
            this.memory.ticksToLive[guard.id] = guard.ticksToLive;
        }

        for (let id in this.memory.ticksToLive) {
            let creep = Game.getObjectById(id);
            if (creep) continue;
            let ticksToLive = this.memory.ticksToLive[id];
            if (ticksToLive > 10) {
                console.log("GUARD:", this.opName, "was killed, increasing potency:",
                    this.memory.potency, "->", ++this.memory.potency);
            }
            else if (this.memory.potency > 1) {
                console.log("GUARD:", this.opName, "guard died of old age, decreasing potency:",
                    this.memory.potency, "->", --this.memory.potency);
            }
            delete this.memory.ticksToLive[id];
        }
    }

    public invalidateMissionCache() {
    }

    private rangerActions(guard: Agent) {
        if (guard.memory.flagIndex === undefined) { guard.memory.flagIndex = 0; }
        let guardedFlag;
        if (guard.memory.reversed) {
            guardedFlag = this.guardedFlags.reverse()[guard.memory.flagIndex];
        } else {
            guardedFlag = this.guardedFlags[guard.memory.flagIndex];
        }
        if (!guardedFlag) {
            return;
        }

        if (guard.hits < guard.hitsMax) {
            guard.heal(guard);
        }

        for (let flag of this.targetFlags) {
            if (flag.pos.roomName === guard.pos.roomName) {
                let structure = flag.pos.lookFor(LOOK_STRUCTURES)[0] as Structure;
                if (structure) {
                    if (guard.pos.inRangeTo(structure, 3) && !guard.isNearExit(0)) {
                        guard.rangedAttack(structure);
                    }
                    else {
                        guard.blindMoveTo(structure);
                    }
                    return;
                }
            }
        }

        let hostiles = _.filter(guard.room.hostiles, (c: Creep) => {
            return c.owner.username !== "Source Keeper" && !c.pos.lookForStructure(STRUCTURE_RAMPART);
        });

        if (hostiles.length > 0) {
            this.guardAttack(guard, hostiles);
            return;
        }

        if (guard.pos.roomName !== guardedFlag.pos.roomName) {
            guard.blindMoveTo(guardedFlag);
            return;
        }

        if (guard.room.controller && guard.room.controller.owner
            && !empire.diplomat.allies[guard.room.controller.owner.username]) {
            let structureTarget = guard.pos.findClosestByRange(FIND_HOSTILE_SPAWNS) as Structure;
            if (!structureTarget) {
                structureTarget = guard.room.findStructures(STRUCTURE_TOWER)[0] as StructureTower;
            }
            if (structureTarget) {
                if (!guard.pos.inRangeTo(structureTarget, 3)) {
                    guard.blindMoveTo(structureTarget);
                }
                else {
                    guard.rangedAttack(structureTarget);
                }
                return;
            }

            let hostileConstruction = _.filter(guard.room.find(FIND_HOSTILE_CONSTRUCTION_SITES),
                (s: ConstructionSite) => {
                    return s.pos.lookFor(LOOK_STRUCTURES).length === 0 && s.progress > 0;
                }) as ConstructionSite[];
            if (hostileConstruction.length > 0) {
                guard.blindMoveTo(guard.pos.findClosestByRange(hostileConstruction));
                return;
            }
        }

        if (guard.pos.isNearTo(guardedFlag)) {
            guard.memory.flagIndex++;
            if (guard.memory.flagIndex >= this.guardedFlags.length) {
                guard.memory.reversed = !guard.memory.reversed;
                guard.memory.flagIndex = 0;
            }
        }
        else {
            guard.blindMoveTo(guardedFlag);
        }
    }

    private guardAttack(guard: Creep, hostiles: Creep[]) {
        let myRangedPartCount = guard.partCount(RANGED_ATTACK);
        for (let hostile of hostiles) {
            if (hostile.partCount(RANGED_ATTACK) > myRangedPartCount * (this.memory.activateBoost ? 4 : 1)) {
                this.scaryDudes.push(hostile);
            }
        }

        // enemy detection
        let nearest = guard.pos.findClosestByRange(hostiles);
        let nearestScaryDude = guard.pos.findClosestByRange(this.scaryDudes) as Creep;

        if (this.memory.targetId) {
            let creep = Game.getObjectById(this.memory.targetId) as Creep;
            if (creep) {
                nearest = creep;
            }
        }

        // attack
        let inRange = false;
        if (nearest && nearest.pos.inRangeTo(guard, 3)) {
            guard.rangedAttack(nearest);
            inRange = true;
        }

        // heal
        if (inRange) {
            guard.heal(guard);
        }

        // move
        if (nearestScaryDude && guard.pos.inRangeTo(nearestScaryDude, 6)) {
            this.archerFlee(guard, nearest);
            guard.rangedAttack(nearestScaryDude);
        }
        else if (guard.memory.exitHopperPos) {
            let pos = helper.deserializeRoomPosition(guard.memory.exitHopperPos);
            if (!guard.pos.inRangeTo(pos, 3)) {
                guard.blindMoveTo(pos);
            }
            delete guard.memory.exitHopperPos;
        }
        else if (nearest) {
            if (nearest.isNearExit(0)) {
                guard.memory.exitHopperPos = nearest.pos;
            }
            let range = guard.pos.getRangeTo(nearest);
            if (range < 3) {
                this.archerFlee(guard, nearest);
            }
            else if (range > 3) {
                guard.blindMoveTo(nearest);
            }
        }
    }

    private archerFlee(guard: Creep, roomObject: RoomObject) {
        let avoidPositions = _.map(guard.pos.findInRange(guard.room.hostiles, 4),
            (c: Creep) => { return {pos: c.pos, range: 20 }; });

        let ret = PathFinder.search(guard.pos, avoidPositions, {
            flee: true,
            swampCost: this.swampRat ? 1 : 5,
            plainCost: this.swampRat ? 2 : 1,
            maxRooms: 1,
            roomCallback: (roomName: string) : CostMatrix => {
                if (roomName !== guard.room.name) return;
                let costs = new PathFinder.CostMatrix();

                helper.blockOffMatrix(costs, roomObject, 2);

                for (let dude of this.scaryDudes) {
                    if (!dude.pos.inRangeTo(guard, 4)) {
                        helper.blockOffMatrix(costs, dude, 5);
                    }
                }

                for (let creep of guard.room.hostiles) {
                    if (creep.pos.lookForStructure(STRUCTURE_RAMPART)) {
                        helper.blockOffMatrix(costs, creep, 1);
                    }
                }

                helper.addStructuresToMatrix(costs, guard.room);

                return costs;
            }});

        let pos = ret.path[0];

        guard.move(guard.pos.getDirectionTo(pos));
    }

    private meleeActions(guard: Creep) {

        let retreating = guard.hits < guard.hitsMax * .5;

        let closest = guard.pos.findClosestByRange(guard.room.hostiles) as Creep;
        if (closest) {
            let range = guard.pos.getRangeTo(closest);
            if (range === 1) {
                guard.attack(closest);
                guard.rangedMassAttack();
            }
            if (range <= 3) {
                guard.rangedAttack(closest);
            }

            if (!retreating) {
                if (range > 1) {
                    guard.blindMoveTo(closest);
                }
            }
        }
    }
}
*/

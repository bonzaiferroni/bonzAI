import {Mission, MissionMemory, MissionState} from "./Mission";
import {Operation} from "../operations/Operation";
import {Agent} from "../agents/Agent";
import {empire} from "../Empire";
import {helper} from "../../helpers/helper";
import {CreepHelper} from "../../helpers/CreepHelper";
import {MatrixHelper} from "../../helpers/MatrixHelper";
import {Traveler} from "../../Traveler";

interface GuardMissionState extends MissionState {
    guardedFlags: Flag[];
    potency: number;
    scaryDudes: Creep[];
    targetFlags: Flag[];
}

interface GuardMissionMemory extends MissionMemory {
    potency: number;
    max: number;
    activateBoost: boolean;
    melee: boolean;
    minPotency: number;
    targetId: string;
    ticksToLive: {[key: string]: number};
    swampRat: boolean;
    vsRanger: boolean;
}

export class GuardMission extends Mission {

    private guards: Agent[];

    public state: GuardMissionState;
    public memory: GuardMissionMemory;
    private distance: number;

    constructor(operation: Operation) {
        super(operation, "guard");
    }

    public init() {
        if (!this.memory.ticksToLive) { this.memory.ticksToLive = {}; }
        if (!this.memory.potency) { this.memory.potency = 1; }
    }

    public update() {
        this.state.scaryDudes = [];
        this.state.guardedFlags = this.getFlagSet("_guarded_", 10);
        this.state.potency = Math.min(this.memory.potency, 8);
        this.state.targetFlags = this.getFlagSet("_targets_", 10);
        if (!this.distance && this.state.guardedFlags.length > 0) {
            this.distance = Traveler.findTravelPath(this.spawnGroup, this.state.guardedFlags[0]).path.length;
        }
    }

    public maxGuards = () => {
        if (this.state.guardedFlags.length === 0) { return 0; }
        if (this.memory.max !== undefined) { return this.memory.max; }
        return 1;
    };

    public guardBody = () => {
        if (this.memory.vsRanger) {
            return this.configBody({
                [MOVE]: 25,
                [RANGED_ATTACK]: 20,
                [HEAL]: 5,
            });
        }

        if (this.memory.potency > 8) {
            console.log(`GUARD: ${
                this.operation.name} potency is higher than 8, seems to be struggling`);
        }
        if (this.memory.melee) {
            // not supported yet
        } else {
            if (this.memory.minPotency && this.state.potency < this.memory.minPotency) {
                this.state.potency = this.memory.minPotency;
            }
            return this.configBody({
                [RANGED_ATTACK]: 2 * this.state.potency,
                [MOVE]: 3 * this.state.potency,
                [HEAL]: this.state.potency,
            });
        }
    };

    public roleCall() {
        let boosts;
        if (this.memory.activateBoost) {
            boosts = [RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE, RESOURCE_CATALYZED_KEANIUM_ALKALIDE];
        }

        this.guards = this.headCount("ranger", this.guardBody, this.maxGuards, {
            prespawn: this.distance * 1.05,
            boosts: boosts,
            allowUnboosted: false,
            disableNotify: true,
        });
    }

    public actions() {
        for (let guard of this.guards) {
            this.rangerActions(guard);
        }
    }

    public finalize() {
        this.managePotency();
    }

    public invalidateCache() {
    }

    private rangerActions(guard: Agent) {
        if (guard.memory.flagIndex === undefined || guard.memory.flagIndex >= this.state.guardedFlags.length) {
            guard.memory.flagIndex = 0;
        }
        let guardedFlag;
        if (guard.memory.reversed) {
            guardedFlag = this.state.guardedFlags.reverse()[guard.memory.flagIndex];
        } else {
            guardedFlag = this.state.guardedFlags[guard.memory.flagIndex];
        }
        if (!guardedFlag) {
            return;
        }

        if (guard.hits < guard.hitsMax) {
            guard.heal(guard);
        }

        for (let flag of this.state.targetFlags) {
            if (flag.pos.roomName === guard.pos.roomName) {
                let structure = flag.pos.lookFor(LOOK_STRUCTURES)[0] as Structure;
                if (structure) {
                    if (guard.pos.inRangeTo(structure, 3) && !guard.pos.isNearExit(0)) {
                        guard.rangedAttack(structure);
                    } else {
                        guard.travelTo(structure);
                    }
                    return;
                }
            }
        }

        let hostiles = _.filter(guard.room.hostiles, (c: Creep) => {
            if (c.owner.username === "Source Keeper") { return false; }
            let rampart = c.pos.lookForStructure(STRUCTURE_RAMPART);
            if (!rampart || (rampart.hits < 10000 && this.memory.minPotency >= 5)) { return true; }
        });

        if (hostiles.length > 0) {
            this.guardAttack(guard, hostiles);
            return;
        }

        if (guard.pos.roomName !== guardedFlag.pos.roomName) {
            guard.travelTo(guardedFlag, {allowSK: true});
            return;
        }

        if (guard.room.controller && guard.room.controller.owner
            && !empire.diplomat.allies[guard.room.controller.owner.username]) {
            let structureTarget = guard.pos.findClosestByRange<Structure>(FIND_HOSTILE_SPAWNS);
            if (!structureTarget && this.memory.minPotency >= 5) {
                structureTarget = guard.pos.findClosestByRange<Structure>(FIND_HOSTILE_STRUCTURES);
            }
            if (structureTarget && !(structureTarget instanceof StructureController)) {
                if (!guard.pos.inRangeTo(structureTarget, 3)) {
                    guard.travelTo(structureTarget, {range: 3});
                } else {
                    guard.rangedAttack(structureTarget);
                }
                return;
            }

            let hostileConstruction = _.filter(guard.room.find(FIND_HOSTILE_CONSTRUCTION_SITES),
                (s: ConstructionSite) => {
                    return s.pos.lookFor(LOOK_STRUCTURES).length === 0 && s.progress > 0;
                }) as ConstructionSite[];
            if (hostileConstruction.length > 0) {
                guard.travelTo(guard.pos.findClosestByRange(hostileConstruction));
                return;
            }
        }

        if (guard.pos.inRangeTo(guardedFlag, 5) && !guard.pos.isNearExit(0)) {
            guard.memory.flagIndex++;
            if (guard.memory.flagIndex >= this.state.guardedFlags.length) {
                guard.memory.reversed = !guard.memory.reversed;
                guard.memory.flagIndex = 0;
            }
        } else {
            guard.travelTo(guardedFlag, {allowSK: true});
        }
    }

    private guardAttack(guard: Agent, hostiles: Creep[]) {
        let myRangedPartCount = guard.partCount(RANGED_ATTACK);
        if (!this.memory.vsRanger) {
            for (let hostile of hostiles) {
                if (CreepHelper.partCount(hostile, RANGED_ATTACK) > myRangedPartCount * (this.memory.activateBoost ? 4 : 1)) {
                    this.state.scaryDudes.push(hostile);
                }
            }
        }

        // enemy detection
        let nearest = guard.pos.findClosestByRange(hostiles);
        let nearestScaryDude = guard.pos.findClosestByRange(this.state.scaryDudes) as Creep;

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
        } else if (guard.memory.exitHopperPos) {
            let pos = helper.deserializeRoomPosition(guard.memory.exitHopperPos);
            if (!guard.pos.inRangeTo(pos, 3)) {
                guard.travelTo(pos);
            }
            delete guard.memory.exitHopperPos;
        } else if (nearest) {
            if (nearest.pos.isNearExit(0)) {
                guard.memory.exitHopperPos = nearest.pos;
            }
            let range = guard.pos.getRangeTo(nearest);
            if (range < 3) {
                this.archerFlee(guard, nearest);
            } else if (range > 3) {
                guard.travelTo(nearest, {movingTarget: true });
            }
        }
    }

    private archerFlee(guard: Agent, roomObject: RoomObject) {
        let avoidPositions = _.map(guard.pos.findInRange(guard.room.hostiles, 4),
            (c: Creep) => { return {pos: c.pos, range: 20 }; });

        let ret = PathFinder.search(guard.pos, avoidPositions, {
            flee: true,
            swampCost: this.memory.swampRat ? 1 : 5,
            plainCost: this.memory.swampRat ? 2 : 1,
            maxRooms: 1,
            roomCallback: (roomName: string) : CostMatrix => {
                if (roomName !== guard.room.name) { return; }
                let costs = new PathFinder.CostMatrix();

                MatrixHelper.blockOffPosition(costs, roomObject, 2);

                for (let dude of this.state.scaryDudes) {
                    if (!dude.pos.inRangeTo(guard, 4)) {
                        MatrixHelper.blockOffPosition(costs, dude, 5);
                    }
                }

                for (let creep of guard.room.hostiles) {
                    if (creep.pos.lookForStructure(STRUCTURE_RAMPART)) {
                        MatrixHelper.blockOffPosition(costs, creep, 1);
                    }
                }

                Traveler.addStructuresToMatrix(this.room, costs, 2);

                return costs;
            }});

        let pos = ret.path[0];

        guard.move(guard.pos.getDirectionTo(pos));
    }

    private managePotency() {
        for (let guard of this.guards) {
            this.memory.ticksToLive[guard.id] = guard.ticksToLive;
        }

        for (let id in this.memory.ticksToLive) {
            let creep = Game.getObjectById(id);
            if (creep) { continue; }
            let ticksToLive = this.memory.ticksToLive[id];
            if (ticksToLive > 10) {
                console.log("GUARD:", this.operation.name, "was killed, increasing potency:",
                    this.memory.potency, "->", this.memory.potency += 4);
            } else if (this.memory.potency > 1) {
                console.log("GUARD:", this.operation.name, "guard died of old age, decreasing potency:",
                    this.memory.potency, "->", --this.memory.potency);
            }
            delete this.memory.ticksToLive[id];
        }
    }
}

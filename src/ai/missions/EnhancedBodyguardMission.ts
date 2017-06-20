
import {Operation} from "../operations/Operation";
import {Mission, MissionMemory, MissionState} from "../missions/Mission";
import {helper} from "../../helpers/helper";
import {Agent} from "../agents/Agent";
import {InvaderGuru} from "./InvaderGuru";
import {CreepHelper} from "../../helpers/CreepHelper";
export class EnhancedBodyguardMission extends Mission {

    private squadAttackers: Agent[];
    private squadHealers: Agent[];

    private hostiles: Creep[];
    private invaderGuru: InvaderGuru;

    public memory: EnhancedBodyguardMemory;

    constructor(operation: Operation, invaderGuru: InvaderGuru,  allowSpawn = true) {
        super(operation, "defense", allowSpawn);
        this.invaderGuru = invaderGuru;
    }

    public init() {
        if (!this.spawnGroup.room.terminal) { return; }
        if (this.memory.allowUnboosted === undefined) {
            let store = this.spawnGroup.room.terminal.store;
            this.memory.allowUnboosted = store[RESOURCE_CATALYZED_UTRIUM_ACID] >= 1000
                && store[RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE] >= 1000;
        }
    }

    public update() {
        if (!this.state.hasVision) { return; } // early
        this.hostiles = _.filter(this.room.hostiles, (hostile: Creep) => hostile.owner.username !== "Source Keeper");

        for (let id in this.memory.ticksToLive) {
            let creep = Game.getObjectById(id);
            if (creep) { continue; }
            let ticksToLive = this.memory.ticksToLive[id];
            if (ticksToLive > 10 && this.memory.allowUnboosted) {
                console.log("DEFENSE:", this.operation.name, "lost a leeroy, increasing potency");
                this.memory.potencyUp = true;
            } else if (this.memory.potencyUp) {
                console.log("DEFENSE:", this.operation.name, "leeroy died of old age, decreasing potency:");
                this.memory.potencyUp = false;
            }
            delete this.memory.ticksToLive[id];
        }
    }

    private squadAttackerBody = () => {
        if (this.memory.potencyUp) {
            return this.configBody({
                [ATTACK]: 10,
                [RANGED_ATTACK]: 2,
                [MOVE]: 12,
            });
        } else {
            return this.configBody({
                [ATTACK]: 20,
                [RANGED_ATTACK]: 5,
                [MOVE]: 25,
            });
        }
    };

    private squadHealerBody = () => {
        if (this.memory.potencyUp) {
            return this.configBody({
                [TOUGH]: 8,
                [MOVE]: 12,
                [HEAL]: 4,
            });
        } else {
            return this.configBody({
                [TOUGH]: 4,
                [MOVE]: 16,
                [HEAL]: 12,
            });
        }
    };

    private getMaxSquads = () => {
        if (this.invaderGuru.invaderProbable) { return 1; }
        if (this.state.hasVision && this.hostiles.length > 0) { return 1; }
        return 0;
    };

    public roleCall() {
        let healerMemory;
        let attackerMemory;
        if (this.memory.potencyUp) {
            attackerMemory = {boosts: [RESOURCE_CATALYZED_UTRIUM_ACID], allowUnboosted: true};
            healerMemory = {boosts: [RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE], allowUnboosted: true};
        }

        this.squadAttackers = this.headCount("lee", this.squadAttackerBody, this.getMaxSquads,
            {prespawn: 100, memory: attackerMemory, skipMoveToRoom: true});
        this.squadHealers = this.headCount("roy", this.squadHealerBody, this.getMaxSquads,
            {prespawn: 100, memory: healerMemory, skipMoveToRoom: true});
    }

    public actions() {

        for (let attacker of this.squadAttackers) {
            this.squadActions(attacker);
        }

        for (let healer of this.squadHealers) {
            this.healerActions(healer);
        }
    }

    public finalize() {
        if (!this.memory.ticksToLive) { this.memory.ticksToLive = {}; }
        for (let creep of this.squadAttackers) {
            this.memory.ticksToLive[creep.id] = creep.ticksToLive;
        }
        for (let creep of this.squadHealers) {
            this.memory.ticksToLive[creep.id] = creep.ticksToLive;
        }
    }

    public invalidateCache() {
        this.memory.allowUnboosted = undefined;
    }

    private squadActions(attacker: Agent) {

        // find healer, flee if there isn't one
        let healer = this.findPartner(attacker, this.squadHealers, 1500);
        if (!healer || healer.spawning) {
            if (attacker.room.name !== this.spawnGroup.pos.roomName || attacker.pos.isNearExit(0)) {
                attacker.travelTo(this.spawnGroup);
            } else {
                attacker.idleOffRoad(this.spawnGroup.room.controller);
            }
            return;
        }

        if (!this.room) {
            // Agent.squadTravel(attacker, healer, this.flag);
            // return;
        }

        // missionRoom is safe
        if (!this.hostiles || this.hostiles.length === 0) {
            attacker.idleNear(this.flag);
            return;
        }

        let attacking = false;
        let rangeAttacking = false;
        let msg = "";
        let target = attacker.pos.findClosestByRange(_.filter(this.hostiles,
            (c: Creep) => CreepHelper.partCount(c, HEAL) > 0)) as Creep;
        if (!target) {
            target = attacker.pos.findClosestByRange(this.hostiles) as Creep;
        }
        if (!target && attacker.memory.targetId) {
            target = Game.getObjectById(attacker.memory.targetId) as Creep;
            if (!target) { attacker.memory.targetId = undefined; }
        }
        if (healer.hits < healer.hitsMax * .5 || attacker.hits < attacker.hitsMax * .5) {
            this.memory.healUp = true;
        }
        if (this.memory.healUp === true) {
            Agent.squadTravel(healer, attacker, this.spawnGroup);
            if (healer.hits > healer.hitsMax * .8 && attacker.hits > attacker.hitsMax * .8) {
                this.memory.healUp = false;
            }
        } else if (target) {
            msg += "t";

            attacker.memory.targetId = target.id;

            let options: TravelToOptions = {};
            if (attacker.room === target.room) {
                options.maxRooms = 1;
            }

            let range = attacker.pos.getRangeTo(target);
            if (range === 1) {
                attacker.rangedMassAttack();
                attacking = attacker.attack(target) === OK;
            } else if (range <= 3) {
                rangeAttacking = attacker.rangedAttack(target) === OK;
            }

            if (attacker.room.name !== target.room.name) {
                msg += "-nr";
                Agent.squadTravel(attacker, healer, target, options);
            } else if (range > 3) {
                msg += "-r3";
                Agent.squadTravel(attacker, healer, target, options);
            } else if (range > 1) {
                let direction = attacker.fleeBuster(target);
                if (direction && attacker.fatigue === 0 && healer.fatigue === 0 && attacker.pos.isNearTo(healer)) {
                    msg += "-fb";
                    attacker.move(direction);
                    healer.travelTo(attacker);
                } else {
                    msg += "-nb";
                    Agent.squadTravel(attacker, healer, target, options);
                }
            } else {
                if (!target.pos.isNearExit(0)) {
                    // directly adjacent, move on to same position
                    Agent.squadTravel(attacker, healer, target);
                } else {
                    let direction = attacker.pos.getDirectionTo(target);
                    if (direction % 2 === 1) { return; } // not a diagonal position, already in best position;
                    let clockwisePosition = attacker.pos.getPositionAtDirection(helper.clampDirection(direction + 1));
                    if (!clockwisePosition.isNearExit(0)) {
                        Agent.squadTravel(attacker, healer, {pos: clockwisePosition});
                    } else {
                        let counterClockwisePosition = attacker.pos.getPositionAtDirection(
                            helper.clampDirection(direction - 1));
                        Agent.squadTravel(attacker, healer, {pos: counterClockwisePosition});
                    }
                }
            }
        } else {
            Agent.squadTravel(attacker, healer, this.flag);
        }

        healer.say(msg);

        let closest = attacker.pos.findClosestByRange(this.hostiles);
        if (closest) {
            let range = attacker.pos.getRangeTo(closest);
            if (!attacking && range === 1) {
                attacker.attack(closest);
                if (!rangeAttacking) {
                    rangeAttacking = true;
                    attacker.rangedMassAttack();
                }
            }
            if (!rangeAttacking && range <= 3) {
                attacker.rangedAttack(closest);
            }
        }
    }

    private healerActions(healer: Agent) {

        if (!this.hostiles || this.hostiles.length === 0) {
            if (healer.hits < healer.hitsMax) {
                healer.heal(healer);
            } else {
                this.medicActions(healer);
            }
            return;
        }

        // hostiles in missionRoom
        let attacker = this.findPartner(healer, this.squadAttackers, 1500);
        if (!attacker || attacker.spawning) {
            if (healer.hits < healer.hitsMax) {
                healer.heal(healer);
            }
            if (attacker && attacker.room.name === healer.room.name) {
                healer.idleOffRoad(this.spawnGroup);
            } else {
                healer.travelTo(this.spawnGroup);
            }
            return;
        }

        // attacker is partnered and spawned
        let range = healer.pos.getRangeTo(attacker);
        if (range <= 3) {
            if (attacker.hitsMax - attacker.hits > healer.hitsMax - healer.hits) {
                if (range > 1) {
                    healer.rangedHeal(attacker);
                } else {
                    healer.heal(attacker);
                }
            } else {
                healer.heal(healer);
            }
        } else if (healer.hits < healer.hitsMax) {
            healer.heal(healer);
        }
    }
}

interface EnhancedBodyguardMemory extends MissionMemory {
    allowUnboosted: boolean;
    ticksToLive: {[creepId: string]: number};
    potencyUp: boolean;
    healUp: boolean;
}

interface EnhancedBodyguardState extends MissionState {
}

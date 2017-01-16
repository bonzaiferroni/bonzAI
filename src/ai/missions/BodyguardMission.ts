import {Mission} from "./Mission";
import {Operation} from "../operations/Operation";
export class BodyguardMission extends Mission {

    defenders: Creep[];
    hostiles: Creep[];

    memory: {
        invaderProbable: boolean
        invaderTrack: {
            energyHarvested: number,
            tickLastSeen: number,
            energyPossible: number,
        }
    };

    /**
     * Remote defense for non-owned rooms. If boosted invaders are likely, use EnhancedBodyguardMission
     * @param operation
     * @param allowSpawn
     */

    constructor(operation: Operation, allowSpawn = true) {
        super(operation, "bodyguard", allowSpawn);
    }

    initMission() {
        if (!this.hasVision) return; // early
        this.hostiles = this.room.hostiles;
        if (this.operation.type === "mining") {
            this.trackEnergyTillInvader();
        }
    }

    roleCall() {
        let maxDefenders = 0;
        if (this.memory.invaderProbable) {
            maxDefenders = 1;
        }
        if (this.hasVision) {
            if (this.hostiles.length > 0) {
                maxDefenders = Math.ceil(this.hostiles.length / 2);
            }
            if (this.operation.type !== "mining" && this.room.findStructures(STRUCTURE_TOWER).length === 0) {
                maxDefenders = 1;
            }
        }


        let defenderBody = () => {
            let unit = this.configBody({
                tough: 1,
                move: 5,
                attack: 3,
                heal: 1
            });
            let potency = Math.min(this.spawnGroup.maxUnits(unit, 1), 3);
            return this.configBody({
                tough: potency,
                move: potency * 5,
                attack: potency * 3,
                heal: potency
            });
        };

        this.defenders = this.headCount("leeroy", defenderBody, maxDefenders, { prespawn: 50 } );
    }

    missionActions() {

        for (let defender of this.defenders) {
            this.defenderActions(defender);
        }
    }

    finalizeMission() {
    }

    invalidateMissionCache() {
    }

    private defenderActions(defender: Creep) {
        if (!this.hasVision || this.hostiles.length === 0) {
            this.idleNear(defender, this.flag);
            if (defender.hits < defender.hitsMax) {
                defender.heal(defender);
            }
            else {
                this.healHurtCreeps(defender);
            }
            return; // early
        }

        let attacking = false;
        let closest: Structure | Creep = defender.pos.findClosestByRange(this.hostiles);
        if (closest) {
            let range = defender.pos.getRangeTo(closest);
            if (range > 1) {
                defender.blindMoveTo(closest, {maxRooms: 1, ignoreRoads: true});
            }
            else {
                attacking = defender.attack(closest) === OK;
                defender.move(defender.pos.getDirectionTo(closest));
            }
        }
        else {
            defender.blindMoveTo(this.hostiles[0]);
        }

        if (!attacking && defender.hits < defender.hitsMax) {
            defender.heal(defender);
        }
    }

    /**
     * Tracks energy harvested and pre-spawns a defender when an invader becomes likely
     */

    public trackEnergyTillInvader() {
        if (!this.memory.invaderTrack) {
            this.memory.invaderTrack = {
                energyHarvested: 0,
                tickLastSeen: Game.time,
                energyPossible: 0 };
        }

        let memory = this.memory.invaderTrack;

        // filter source keepers
        let hostiles = this.hostiles;

        let harvested = 0;
        let possible = 0;
        let sources = this.room.find(FIND_SOURCES) as Source[];
        for (let source of sources) {
            if (source.ticksToRegeneration === 1) {
                harvested += source.energyCapacity - source.energy;
                possible += source.energyCapacity;
            }
        }

        memory.energyHarvested += harvested;
        memory.energyPossible += possible;

        if (sources.length === 3) {
            this.memory.invaderProbable = memory.energyHarvested > 65000;
        }
        else if (sources.length === 2 && Game.time - memory.tickLastSeen < 20000) {
            this.memory.invaderProbable = memory.energyHarvested > 75000;
        }
        else if (sources.length === 1 && Game.time - memory.tickLastSeen < 20000) {
            this.memory.invaderProbable = memory.energyHarvested > 90000;
        }
        else {
            this.memory.invaderProbable = false;
        }

        if (hostiles.length > 0 && Game.time - memory.tickLastSeen > CREEP_LIFE_TIME) {
            // reset trackers
            memory.energyPossible = 0;
            memory.energyHarvested = 0;
            memory.tickLastSeen = Game.time;
        }
    }

    private healHurtCreeps(defender: Creep) {
        let hurtCreep = this.findHurtCreep(defender);
        if (!hurtCreep) {
            this.idleNear(defender, this.flag);
            return;
        }

        // move to creep
        let range = defender.pos.getRangeTo(hurtCreep);
        if (range > 1) {
            defender.blindMoveTo(hurtCreep, {maxRooms: 1});
        }
        else {
            defender.yieldRoad(hurtCreep);
        }

        if (range === 1) {
            defender.heal(hurtCreep);
        }
        else if (range <= 3) {
            defender.rangedHeal(hurtCreep);
        }
    }

    private findHurtCreep(defender: Creep) {
        if (!this.room) return;

        if (defender.memory.healId) {
            let creep = Game.getObjectById(defender.memory.healId) as Creep;
            if (creep && creep.room.name === defender.room.name && creep.hits < creep.hitsMax) {
                return creep;
            }
            else {
                defender.memory.healId = undefined;
                return this.findHurtCreep(defender);
            }
        }
        else if (!defender.memory.healCheck || Game.time - defender.memory.healCheck > 25) {
            defender.memory.healCheck = Game.time;
            let hurtCreep = _(this.room.find<Creep>(FIND_MY_CREEPS))
                .filter((c: Creep) => c.hits < c.hitsMax && c.ticksToLive > 100)
                .sortBy((c: Creep) => -c.partCount(WORK))
                .head();

            if (hurtCreep) {
                defender.memory.healId = hurtCreep.id;
                return hurtCreep;
            }
        }
    }
}
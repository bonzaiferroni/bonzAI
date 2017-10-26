import {Mission, MissionMemory, MissionState} from "./Mission";
import {Operation} from "../operations/Operation";
import {Agent} from "../agents/Agent";
import {InvaderGuru} from "./InvaderGuru";
import {helper} from "../../helpers/helper";
import {Scheduler} from "../../Scheduler";
import {CreepHelper} from "../../helpers/CreepHelper";
import {Notifier} from "../../notifier";
import {MatrixHelper} from "../../helpers/MatrixHelper";
import {PosHelper} from "../../helpers/PosHelper";
import {CombatAgent} from "../agents/CombatAgent";
import {Traveler, TravelToOptions} from "../../Traveler/Traveler";

interface LairMissionMemory extends MissionMemory {
    bestLairOrder: string[];
    assistUntil: number;
    invTick: number;
}

interface LairMissionState extends MissionState {
    lairs: StructureKeeperLair[];
    targetLair: StructureKeeperLair;
    storeStructure: StructureStorage | StructureContainer | StructureTerminal;
    distanceToSpawn: number;
    keepers: Creep[];
}

export class LairMission extends Mission {

    private scavengers: Agent[];
    private trappers: CombatAgent[];
    private decoys: CombatAgent[];
    private invaderGuru: InvaderGuru;

    public state: LairMissionState;
    public memory: LairMissionMemory;

    constructor(operation: Operation, invaderGuru: InvaderGuru) {
        super(operation, "lair");
        this.invaderGuru = invaderGuru;
    }

    public init() {
    }

    public update() {
        if (!this.state.hasVision) { return; } // early

        this.state.lairs = this.findLairs();
        this.state.keepers = _(this.room.hostiles).filter(x => x.owner.username === "Source Keeper").value();
        this.assignKeepers();
        this.state.targetLair = this.findTargetLair();
        this.state.storeStructure = this.spawnGroup.room.storage;
        this.state.distanceToSpawn = this.operation.remoteSpawn.distance;
    }

    private maxTrappers = () => 1;
    private trapperBody = () => this.configBody({move: 25, attack: 19, heal: 6});
    private maxScavangers = () => 1;
    private scavangerBody = () => this.workerBody(0, 33, 17);
    private maxDecoys = () => {
        if (this.invaderGuru.invaderProbable || this.invaderGuru.invadersPresent) {
            return 1;
        } else {
            return 0;
        }
    };
    private decoyBody = () => {
        return this.configBody({tough: 5, ranged_attack: 10, move: 25, heal: 10});
    };

    public roleCall() {
        this.trappers = this.headCountAgents(CombatAgent, "trapper", this.trapperBody, this.maxTrappers, {
            prespawn: this.state.distanceToSpawn + 100,
            skipMoveToRoom: true,
        });

        this.decoys = this.headCountAgents(CombatAgent, "decoy", this.decoyBody, this.maxDecoys, {
            prespawn: this.state.distanceToSpawn + 50,
        });

        this.scavengers = this.headCount("scavenger", this.scavangerBody, this.maxScavangers, {
            prespawn: this.state.distanceToSpawn,
        });
    }

    public actions() {

        // temporary
        this.trackInvasions();

        // needs to come before trapper, detects this.state.invaderDuty
        for (let decoy of this.decoys) {
            this.decoyActions(decoy);
        }

        for (let trapper of this.trappers) {
            this.trapperActions(trapper);
        }

        for (let scavenger of this.scavengers) {
            this.scavengersActions(scavenger);
        }
    }

    public finalize() {
    }

    public invalidateCache() {
    }

    private trapperActions(trapper: CombatAgent) {

        let invaderDuty = this.invaderDutyActions(trapper);
        if (invaderDuty) { return; }

        if (!this.state.targetLair) {
            if (trapper.hits < trapper.hitsMax) {
                trapper.heal(trapper);
            }
            trapper.travelTo(this.flag);
            return; // early
        }

        let isAttacking = false;
        let range;
        let nearestHostile = trapper.pos.findClosestByRange(this.room.hostiles) as Creep;
        if (nearestHostile && trapper.pos.isNearTo(nearestHostile)) {
            isAttacking = trapper.attack(nearestHostile) === OK;
            trapper.move(trapper.pos.getDirectionTo(nearestHostile));
        } else {
            let keeper = this.state.targetLair.keeper;
            if (keeper) {
                range = trapper.pos.getRangeTo(keeper);
                // stop and heal at range === 4 if needed
                if (range > 1 && (range !== 4 || trapper.hitsMax === trapper.hits)) {
                    trapper.travelTo(keeper, {pushy: true});
                }
            } else {
                trapper.travelTo(this.state.targetLair, {range: 1, pushy: true});
            }
        }

        if (!isAttacking && (trapper.hits < trapper.hitsMax || range <= 3)) {
            trapper.heal(trapper);
        }
    }

    private invaderDutyActions(trapper: CombatAgent): boolean {

        if (!this.invaderGuru.invadersPresent) {
            return false;
        }

        let attacking = trapper.standardMelee() === OK;

        if (this.invaderGuru.invaders.length > 2 && this.decoys.length === 0) {
            let fleeing = this.trapperFlee(trapper);
            if (fleeing) {
                trapper.standardHealing();
                return true;
            }
        }

        let bestTarget = _(this.invaderGuru.invaders)
            .filter(x => CreepHelper.partCount(x.creep, HEAL) > 0)
            .max(x =>
                (x.isBoosted() ? 1000 : 0)
                - (x.room === trapper.room ? x.pos.getRangeTo(trapper) * 10 : 0)
            );
        if (_.isObject(bestTarget)) {
            this.invasionTravel(trapper, bestTarget);
        } else {
            return false;
        }

        if (attacking) {
            if (trapper.hits < trapper.hitsMax * .4) {
                trapper.creep.cancelOrder("attack");
                trapper.heal(trapper);
            }
        } else {
            trapper.standardAgentHealing(this.trappers.concat(this.decoys));
        }

        return true;
    }

    private invasionTravel(agent: Agent, destination: {pos: RoomPosition}): number {
        let roomCallback = (roomName: string, matrix: CostMatrix) => {
            if (roomName !== this.roomName) { return; }
            matrix = matrix.clone();
            MatrixHelper.blockOffExits(matrix);
            for (let hostile of this.invaderGuru.invaders) {
                if (hostile.getActiveBodyparts(RANGED_ATTACK) > 1) {
                    MatrixHelper.blockOffPosition(matrix, hostile, 3, 1, true);
                }
            }
            for (let keeper of this.state.keepers) {
                MatrixHelper.blockOffPosition(matrix, keeper, 3, 10, true);
            }
            for (let lair of this.state.lairs) {
                MatrixHelper.blockOffPosition(matrix, lair, 5, 5, true);
            }
            return matrix;
        };

        let rangeToDestination = agent.pos.getRangeTo(destination);
        if (rangeToDestination === 1 && destination.pos.isNearExit(0)) {
            return OK;
        }

        let options: TravelToOptions = {
            ignoreRoads: true,
        };

        if (rangeToDestination > 8) {
            options.repath = .1;
            options.movingTarget = true;
        }

        if (agent.room.name === destination.pos.roomName) {
            options.maxRooms = 1;
            options.roomCallback = roomCallback;
        }

        return agent.travelTo(destination, options);
    }

    private trapperFlee(trapper: CombatAgent): boolean {
        let spookies = _(this.invaderGuru.invaders)
            .filter(x => x.getActiveBodyparts(RANGED_ATTACK) > 0)
            .value();

        if (spookies.length === 0) { return false; }
        let fleeRange = 8;
        if (trapper.hits < trapper.hitsMax) {
            fleeRange = 12;
        }
        let fleeing = trapper.fleeHostiles(fleeRange);
        if (fleeing) {
            return true;
        }
    }

    private decoyActions(decoy: CombatAgent) {
        if (!this.invaderGuru.invadersPresent) {

            if (decoy.room !== this.room || decoy.pos.isNearExit(0)) {
                decoy.travelTo(this.flag);
                return true;
            }

            let assisting = this.assistKeeperDuty(decoy);
            if (assisting) { return; }
            let healing = this.medicActions(decoy);
            if (healing) { return; }

            if (!this.invaderGuru.invaderProbable) {
                this.goFreelance(decoy, "ranger");
            }
            return;
        }

        decoy.standardAttackActions(this.roomName);
    }

    private assistKeeperDuty(decoy: CombatAgent) {

        if (this.state.keepers.length <= 1 && this.trappers.length > 0) {
            if (!this.memory.assistUntil || Game.time > this.memory.assistUntil) {
                return false;
            }
        } else {
            this.memory.assistUntil = Game.time + 25;
        }

        decoy.standardRangedAttack();
        decoy.standardHealing(undefined, true);

        let trapper = decoy.pos.findClosestByRange(this.trappers);
        if (!trapper) {

            if (decoy.hits < decoy.hitsMax) {
                decoy.heal(decoy);
            }

            // solo duty
            let keeper = decoy.pos.findClosestByRange(this.state.keepers);
            let range = decoy.pos.getRangeTo(keeper);
            if (decoy.hits < decoy.hitsMax * .9) {
                if (range === 4) {
                    // do nothing
                } else if (range < 4) {
                    decoy.fleeHostiles();
                } else {
                    decoy.travelTo(keeper, {maxRooms: 1});
                }
            } else {
                if (range === 3) {
                    // do nothing
                } else if (range < 3) {
                    decoy.fleeHostiles();
                } else {
                    decoy.travelTo(keeper, {maxRooms: 1});
                }
            }
            return true;
        }

        decoy.travelTo(trapper, {movingTarget: true, maxRooms: 1});
        return true;
    }

    private scavengersActions(scavenger: Agent) {

        let fleeing = scavenger.fleeHostiles();
        if (fleeing) { return; } // early

        let hasLoad = scavenger.hasLoad();
        if (hasLoad) {
            let storage = this.state.storeStructure;
            if (scavenger.pos.isNearTo(storage)) {
                scavenger.transfer(storage, RESOURCE_ENERGY);
                scavenger.travelTo(this.flag);
            } else {
                scavenger.travelTo(storage);
            }
            return;
        }

        let closest = this.findDroppedEnergy(scavenger);
        if (closest) {
            if (scavenger.pos.isNearTo(closest)) {
                scavenger.pickup(closest);
                scavenger.say("yoink!", true);
            } else {
                scavenger.travelTo(closest, {pushy: true});
            }
        } else {
            scavenger.idleNear(this.flag);
        }
    }

    private assignKeepers() {
        if (!this.state.lairs) { return; }
        let lairs = this.state.lairs;
        for (let hostile of this.state.keepers) {
            let closestLair = hostile.pos.findClosestByRange<StructureKeeperLair>(lairs);
            closestLair.keeper = hostile;
        }
    }

    private findTargetLair() {
        if (this.state.lairs.length > 0) {
            let lowestTicks = Number.MAX_VALUE;
            let lowestLair;
            for (let lair of this.state.lairs) {
                let lastTicks = 0;
                if (lair.keeper) {
                    return lair;
                } else {
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
            } else {
                scavenger.memory.resourceId = undefined;
                return this.findDroppedEnergy(scavenger);
            }
        } else {
            if (!this.room) { return; }
            if (scavenger.memory.nextLook > Game.time) { return; }
            scavenger.memory.nextLook = undefined;

            let resource = scavenger.pos.findClosestByRange(
                _.filter(this.room.find(FIND_DROPPED_RESOURCES),
                    (r: Resource) => r.amount > 100 && r.resourceType === RESOURCE_ENERGY
                    && r.pos.findInRange(this.room.hostiles, 10).length === 0) as Resource[]);
            if (resource) {
                scavenger.memory.resourceId = resource.id;
                return resource;
            } else {
                scavenger.memory.nextLook = Game.time + 10;
            }
        }
    }

    private bestLairOrder(): string[] {
        let keeperLairs: StructureKeeperLair[] = this.room.findStructures<StructureKeeperLair>(STRUCTURE_KEEPER_LAIR);
        let distanceBetweenLairAB: {[AtoB: string]: number} = {};

        let order = 0;
        let indices = _.map(keeperLairs, lair => order++);

        console.log(`Finding best keeper path in ${this.room.name}`);

        let bestPermutation: number[];
        let bestSum = Number.MAX_VALUE;
        for (let permutation of helper.permutator(indices)) {
            let sum = 0;
            for (let i = 0; i < permutation.length; i++) {
                let indexA = permutation[i];
                let indexB = permutation[(i + 1) % permutation.length];
                let key = _.sortBy([indexA, indexB]).join("");
                if (!distanceBetweenLairAB[key]) {
                    distanceBetweenLairAB[key] = Traveler.findTravelPath( keeperLairs[indexA].pos,
                        keeperLairs[indexB].pos).path.length;
                }

                sum += distanceBetweenLairAB[key];
            }

            if (sum < bestSum) {
                console.log(`new shortest (${sum}) `, _.map(permutation,
                    i => [keeperLairs[i].pos.x, keeperLairs[i].pos.y] + " to ").join(""));
                bestSum = sum;
                bestPermutation = permutation;
            }
        }

        return _.map(bestPermutation, index => keeperLairs[index].id);
    }

    private findLairs(): StructureKeeperLair[] {
        if (!Scheduler.delay(this.memory, "nextLairCheck", 10000) || !this.memory.bestLairOrder) {
            this.memory.bestLairOrder = this.bestLairOrder();
        }

        return _.map(this.memory.bestLairOrder, id => Game.getObjectById<StructureKeeperLair>(id));
    }

    private trackInvasions() {
        if (this.invaderGuru.invadersPresent) {
            if (!this.memory.invTick) {
                this.memory .invTick = Game.time;
                console.log("****** lairmission invader", this.invaderGuru.invaders.length, this.roomName);
            }
        } else if (this.memory.invTick) {
            let defenseTime = Game.time - this.memory.invTick;
            if (defenseTime > 100) {
                Notifier.log(`long SK defense time ${defenseTime} in ${this.roomName}`, 4);
            }
            if (!Memory.temp.invTicks) { Memory.temp.invTicks = []; }
            Memory.temp.invTicks.push(this.memory.invTick);
            Memory.stats["temp.invTick"] = Math.ceil(_.sum(Memory.temp.invTicks) / Memory.temp.invTicks.length );
            while (Memory.temp.invTicks.length > 10) {
                Memory.temp.invTicks.shift();
            }
            delete this.memory.invTick;
        }
    }
}

import {Mission} from "./Mission";
import {Operation} from "../operations/Operation";
import {helper} from "../../helpers/helper";
import {notifier} from "../../notifier";
import {RaidCache} from "../../interfaces";
import {RaidGuru} from "./RaidGuru";
import {ZombieGuru, ZombieStatus, BOOST_AVERAGE_HITS} from "./ZombieGuru";
import {ZombieAgent} from "./ZombieAgent";

export class ZombieMission extends Mission {

    zombies: Creep[];
    guru: ZombieGuru;

    constructor(operation: Operation) {
        super(operation, "zombie");
    }

    initMission() {
        this.guru = new ZombieGuru(this);
        this.guru.init(this.flag.pos.roomName, true);
    }

    roleCall() {

        let max = 0;
        if (this.guru.status === ZombieStatus.Attack) {
            max = 3;
        }

        this.zombies = this.headCount("zombie", this.getBody, max, {
                memory: {boosts: this.guru.boost, safeCount: 0},
                prespawn: this.memory.prespawn,
                skipMoveToRoom: true,
                blindSpawn: true});
    }

    missionActions() {
        for (let zombie of this.zombies) {
            this.zombieActions(new ZombieAgent(zombie, this, this.guru));
        }
    }

    finalizeMission() {

        if (this.guru.status === ZombieStatus.Complete) {
            notifier.add(`ZOMBIE: mission complete in ${this.room.name}`);
            this.flag.remove();
        }
    }

    invalidateMissionCache() {
    }

    private zombieActions(zombie: ZombieAgent) {

        let currentlyHealing = zombie.healWhenHurt(zombie, this.guru.expectedDamage / 10) === OK;
        zombie.massRangedAttackInRoom();

        // retreat condition
        let threshold = 500;
        if (this.guru.boost) {
            threshold = 250;
        }
        if (!zombie.isFullHealth(threshold)) {
            zombie.memory.reachedFallback = false;
        }

        if (!zombie.memory.reachedFallback) {
            if (zombie.isNearTo(this.guru.fallbackPos) && zombie.isFullHealth()) {
                this.registerPrespawn(zombie);
                zombie.memory.reachedFallback = true;
            }
            zombie.travelTo({pos: this.guru.fallbackPos});
            return;
        }

        if (zombie.pos.isNearExit(0)) {
            if (zombie.isFullHealth(threshold)) {zombie.memory.safeCount++; }
            else {zombie.memory.safeCount = 0;}
            console.log(zombie.creep.hits, zombie.memory.safeCount);
            if (zombie.memory.safeCount < 10) {
                return;
            }
        }
        else {
            zombie.memory.safeCount = 0;
        }

        let destination = zombie.findDestination();

        let position = zombie.moveZombie(destination, zombie.memory.demolishing);
        zombie.memory.demolishing = false;
        if (zombie.room == this.room && !zombie.pos.isNearExit(0) && position instanceof RoomPosition) {
            let structure = position.lookFor<Structure>(LOOK_STRUCTURES)[0];
            if (structure && structure.structureType !== STRUCTURE_ROAD) {
                zombie.memory.demolishing = true;
                if (!currentlyHealing) {
                    zombie.attack(structure);
                }
            }
        }
    }

    getBody = (): string[] => {
        if (this.guru.expectedDamage === 0) {
            return this.workerBody(10, 0, 10);
        }
        if (this.guru.boost) {
            let healCount = Math.ceil((this.guru.expectedDamage * .3) / (HEAL_POWER * 4)); // boosting heal and tough
            let moveCount = 10;
            let rangedAttackCount = 1;
            let toughCount = 8;
            let dismantleCount = MAX_CREEP_SIZE - moveCount - rangedAttackCount - toughCount - healCount;
            return this.configBody({[TOUGH]: toughCount, [WORK]: dismantleCount, [RANGED_ATTACK]: rangedAttackCount,
                [MOVE]: moveCount, [HEAL]: healCount})
        }
        else {
            let healCount = Math.ceil(this.guru.expectedDamage / HEAL_POWER);
            let moveCount = 17; // move once every other tick
            let dismantleCount = MAX_CREEP_SIZE - healCount - moveCount;
            return this.configBody({[WORK]: dismantleCount, [MOVE]: 17, [HEAL]: healCount })
        }
    };
}
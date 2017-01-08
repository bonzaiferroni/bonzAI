import {RaidGuru} from "./RaidGuru";

export const BOOST_AVERAGE_HITS = 2000000;
export const BOOST_DRAIN_DAMAGE = 240;
export const MAX_AVERAGE_HITS = 20000000;
export const MAX_DRAIN_DAMAGE = 1000;
export enum ZombieStatus { Attack, Upgrade, Hold, Complete }

export class ZombieGuru extends RaidGuru {

    memory: {
        status: ZombieStatus;
        prespawn: number;
        startPosition: RoomPosition;
    };

    get status(): ZombieStatus {
        if (!this.cache) return;
        if (!this.memory.status) return ZombieStatus.Attack;

        if (this.raidRoom) {
            if (this.raidRoom.structures[STRUCTURE_SPAWN].length === 0) {
                this.memory.status = ZombieStatus.Complete;
            }
            else if (this.cache.expectedDamage > MAX_DRAIN_DAMAGE || this.cache.avgWallHits > MAX_AVERAGE_HITS) {
                this.memory.status = ZombieStatus.Upgrade
            }
            else if (this.raidRoom.controller.safeMode) {
                this.memory.status = ZombieStatus.Hold;
            }
            else {
                this.memory.status = ZombieStatus.Attack;
            }
        }
        return this.memory.status;
    }

    get boost(): string[] {
        if (!this.cache) return;
        if (this.cache.expectedDamage > BOOST_DRAIN_DAMAGE || this.cache.avgWallHits > BOOST_AVERAGE_HITS) {
            return [RESOURCE_CATALYZED_GHODIUM_ALKALIDE, RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE,
                RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE, RESOURCE_CATALYZED_ZYNTHIUM_ACID];
        }
    }

    get max(): number {
        let activeLifeTime = CREEP_LIFE_TIME;
        if (this.host.memory.prespawn) {
            activeLifeTime = this.host.memory.prespawn;
            console.log("activeLifeTime: " + activeLifeTime);
        }
        return Math.min(3, Math.ceil((Game.time - this.startTime) / activeLifeTime));
    }
}
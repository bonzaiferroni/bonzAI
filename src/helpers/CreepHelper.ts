export class CreepHelper {
    public static isBoosted(creep: Creep) {
        for (let part of creep.body) {
            if (part.boost) {
                return true;
            }
        }
        return false;
    }

    public static partCount(creep: Creep, partType: string, boostOnly = false): number {
        let count = 0;
        if (boostOnly) {
            for (let part of creep.body) {
                if (!part.boost) { continue; }
                if (part.type === partType) {
                    count++;
                }
            }
        } else {
            for (let part of creep.body) {
                if (part.type === partType) {
                    count++;
                }
            }
        }
        return count;
    };

    public static calculateShield(creep: Creep) {
        let shield = 0;
        for (let part of creep.body) {
            if (part.type !== TOUGH) { continue; }
            if (part.boost) {
                shield += part.hits / BOOSTS[TOUGH][part.boost]["damage"];
            } else {
                shield += part.hits;
            }
        }
        return shield;
    }
}
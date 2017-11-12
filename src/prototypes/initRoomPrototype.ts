import {ROOMTYPE_SOURCEKEEPER, WorldMap} from "../ai/WorldMap";
import {core} from "../ai/Empire";
import {Tick} from "../Tick";
import {CreepHelper} from "../helpers/CreepHelper";

export function initRoomPrototype() {

    Object.defineProperty(Room.prototype, "friendlies", {
        get: function myProperty() {
            if (!Tick.cache.friendlies[this.name]) {
                Tick.cache.friendlies[this.name] = _.filter(this.find(FIND_MY_CREEPS) as Creep[],
                    x => !CreepHelper.isCivilian(x));
            }
            return Tick.cache.friendlies[this.name];
        },
        configurable: true,
    });

    Object.defineProperty(Room.prototype, "hostiles", {
        get: function myProperty() {
            if (!Tick.cache.hostiles[this.name]) {
                let hostiles = this.find(FIND_HOSTILE_CREEPS) as Creep[];
                let filteredHostiles = [];
                for (let hostile of hostiles) {
                    let isEnemy = core.diplomat.checkEnemy(hostile);
                    if (isEnemy) {
                        filteredHostiles.push(hostile);
                    }
                }
                Tick.cache.hostiles[this.name] = filteredHostiles;
            }
            return Tick.cache.hostiles[this.name];
        },
        configurable: true,
    });

    // deprecated
    Object.defineProperty(Room.prototype, "hostilesAndLairs", {
        get: function myProperty() {
            if (!Tick.cache.hostilesAndLairs[this.name]) {
                let lairs = _.filter(this.findStructures(STRUCTURE_KEEPER_LAIR), (lair: StructureKeeperLair) => {
                    return !lair.ticksToSpawn || lair.ticksToSpawn < 10;
                });
                Tick.cache.hostilesAndLairs[this.name] = lairs.concat(this.hostiles);
            }
            return Tick.cache.hostilesAndLairs[this.name];
        },
        configurable: true,
    });

    Object.defineProperty(Room.prototype, "structures", {
        get: function myProperty() {
            if (!Tick.cache.structures[this.name]) {
                Tick.cache.structures[this.name] = _.groupBy(
                    this.find(FIND_STRUCTURES), (s: Structure) => s.structureType);
            }
            return Tick.cache.structures[this.name] || [];
        },
        configurable: true,
    });

    /**
     * Returns array of structures, caching results on a per-tick basis
     * @param structureType
     * @returns {Structure[]}
     */
    Room.prototype.findStructures = function<T extends Structure>(structureType: string): T[] {
        if (!Tick.cache.structures[this.name]) {
            Tick.cache.structures[this.name] = _.groupBy(this.find(FIND_STRUCTURES), (s: Structure) => s.structureType);
        }
        return Tick.cache.structures[this.name][structureType] || [] as any;
    };

    Object.defineProperty(Room.prototype, "fleeObjects", {
        get: function myProperty() {
            if (!Tick.cache.fleeObjects[this.name]) {
                let fleeObjects = _.filter(this.hostiles, (c: Creep): boolean => {
                    if (c instanceof Creep) {
                        return _.find(c.body, (part: BodyPartDefinition) => {
                                return part.type === ATTACK || part.type === RANGED_ATTACK;
                            }) !== null;
                    } else {
                        return true;
                    }
                });

                if (WorldMap.roomType(this.name) === ROOMTYPE_SOURCEKEEPER) {
                    fleeObjects = fleeObjects.concat(this.lairThreats);
                }

                Tick.cache.fleeObjects[this.name] = fleeObjects;
            }

            return Tick.cache.fleeObjects[this.name];
        },
        configurable: true,
    });

    Object.defineProperty(Room.prototype, "lairThreats", {
        get: function myProperty() {
            if (!Tick.cache.lairThreats[this.name]) {
                Tick.cache.lairThreats[this.name] = _.filter(this.findStructures(STRUCTURE_KEEPER_LAIR),
                    (lair: StructureKeeperLair) => { return !lair.ticksToSpawn || lair.ticksToSpawn < 10; });
            }
            return Tick.cache.lairThreats[this.name];
        },
        configurable: true,
    });
}

import {ROOMTYPE_SOURCEKEEPER, ROOMTYPE_CORE, ROOMTYPE_CONTROLLER, ROOMTYPE_ALLEY, WorldMap} from "../ai/WorldMap";
import {Agent} from "../ai/agents/Agent";
import {empire} from "../ai/Empire";
import {Tick} from "../Tick";
import {Traveler} from "../ai/Traveler";

export function initRoomPrototype() {
    Object.defineProperty(Room.prototype, "hostiles", {
        get: function myProperty() {
            if (!Tick.cache.hostiles[this.name]) {
                let hostiles = this.find(FIND_HOSTILE_CREEPS) as Creep[];
                let filteredHostiles = [];
                for (let hostile of hostiles) {
                    let username = hostile.owner.username;
                    let isEnemy = empire.diplomat.checkEnemy(username, this.name);
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
    Room.prototype.findStructures = function(structureType: string): Structure[] {
        if (!Tick.cache.structures[this.name]) {
            Tick.cache.structures[this.name] = _.groupBy(this.find(FIND_STRUCTURES), (s: Structure) => s.structureType);
        }
        return Tick.cache.structures[this.name][structureType] || [];
    };

    /**
     * Returns missionRoom coordinates for a given missionRoom
     * @returns {*}
     */

    Object.defineProperty(Room.prototype, "coords", {
        get: function myProperty() {
            if (!this.memory.coordinates) {
                this.memory.coordinates = WorldMap.getRoomCoordinates(this.name);
            }
            return this.memory.coordinates;
        },
        configurable: true,
    });

    Object.defineProperty(Room.prototype, "defaultMatrix", {
        get: function myProperty() {
            return Traveler.getStructureMatrix(this);
        },
        configurable: true,
    });

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

                if (this.roomType === ROOMTYPE_SOURCEKEEPER) {
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

import {ROOMTYPE_SOURCEKEEPER, ROOMTYPE_CORE, ROOMTYPE_CONTROLLER, ROOMTYPE_ALLEY, WorldMap} from "../ai/WorldMap";
import {Agent} from "../ai/agents/Agent";
import {empire} from "../ai/Empire";

export function initRoomPrototype() {
    Object.defineProperty(Room.prototype, "hostiles", {
        get: function myProperty() {
            if (!Game.cache.hostiles[this.name]) {
                let hostiles = this.find(FIND_HOSTILE_CREEPS) as Creep[];
                let filteredHostiles = [];
                for (let hostile of hostiles) {
                    let username = hostile.owner.username;
                    let isEnemy = empire.diplomat.checkEnemy(username, this.name);
                    if (isEnemy) {
                        filteredHostiles.push(hostile);
                    }
                }
                Game.cache.hostiles[this.name] = filteredHostiles;
            }
            return Game.cache.hostiles[this.name];
        },
    });

    // deprecated
    Object.defineProperty(Room.prototype, "hostilesAndLairs", {
        get: function myProperty() {
            if (!Game.cache.hostilesAndLairs[this.name]) {
                let lairs = _.filter(this.findStructures(STRUCTURE_KEEPER_LAIR), (lair: StructureKeeperLair) => {
                    return !lair.ticksToSpawn || lair.ticksToSpawn < 10;
                });
                Game.cache.hostilesAndLairs[this.name] = lairs.concat(this.hostiles);
            }
            return Game.cache.hostilesAndLairs[this.name];
        },
    });

    Object.defineProperty(Room.prototype, "roomType", {
        get: function myProperty(): number {
            if (!this.memory.roomType) {

                // source keeper
                let lairs = this.findStructures(STRUCTURE_KEEPER_LAIR);
                if (lairs.length > 0) {
                    this.memory.roomType = ROOMTYPE_SOURCEKEEPER;
                }

                // core
                if (!this.memory.roomType) {
                    let sources = this.find(FIND_SOURCES);
                    if (sources.length === 3) {
                        this.memory.roomType = ROOMTYPE_CORE;
                    }
                }

                // controller rooms
                if (!this.memory.roomType) {
                    if (this.controller) {
                        this.memory.roomType = ROOMTYPE_CONTROLLER;
                    } else {
                        this.memory.roomType = ROOMTYPE_ALLEY;
                    }
                }
            }
            return this.memory.roomType;
        },
    });

    Object.defineProperty(Room.prototype, "structures", {
        get: function myProperty() {
            if (!Game.cache.structures[this.name]) {
                Game.cache.structures[this.name] = _.groupBy(
                    this.find(FIND_STRUCTURES), (s: Structure) => s.structureType);
            }
            return Game.cache.structures[this.name] || [];
        },
    });

    /**
     * Returns array of structures, caching results on a per-tick basis
     * @param structureType
     * @returns {Structure[]}
     */
    Room.prototype.findStructures = function(structureType: string): Structure[] {
        if (!Game.cache.structures[this.name]) {
            Game.cache.structures[this.name] = _.groupBy(this.find(FIND_STRUCTURES), (s: Structure) => s.structureType);
        }
        return Game.cache.structures[this.name][structureType] || [];
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
    });

    Object.defineProperty(Room.prototype, "defaultMatrix", {
        get: function myProperty() {
            return empire.traveler.getStructureMatrix(this);
        },
    });

    Object.defineProperty(Room.prototype, "fleeObjects", {
        get: function myProperty() {
            if (!Game.cache.fleeObjects[this.name]) {
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

                Game.cache.fleeObjects[this.name] = fleeObjects;
            }

            return Game.cache.fleeObjects[this.name];
        },
    });

    Object.defineProperty(Room.prototype, "lairThreats", {
        get: function myProperty() {
            if (!Game.cache.lairThreats[this.name]) {
                Game.cache.lairThreats[this.name] = _.filter(this.findStructures(STRUCTURE_KEEPER_LAIR),
                    (lair: StructureKeeperLair) => { return !lair.ticksToSpawn || lair.ticksToSpawn < 10; });
            }
            return Game.cache.lairThreats[this.name];
        },
    });
}

import {helper} from "../helpers/helper";
import {ROOMTYPE_SOURCEKEEPER, ROOMTYPE_CORE, ROOMTYPE_CONTROLLER, ROOMTYPE_ALLEY} from "../config/constants";

export function initRoomPrototype() {
    Object.defineProperty(Room.prototype, "hostiles", {
        get: function myProperty() {
            if (!Game.cache.hostiles[this.name]) {
                let hostiles = this.find(FIND_HOSTILE_CREEPS) as Creep[];
                let filteredHostiles = [];
                for (let hostile of hostiles) {
                    let username = hostile.owner.username;
                    let isEnemy = helper.checkEnemy(username, this.name);
                    if (isEnemy) {
                        filteredHostiles.push(hostile);
                    }
                }
                Game.cache.hostiles[this.name] = filteredHostiles;
            }
            return Game.cache.hostiles[this.name];
        }
    });

    Object.defineProperty(Room.prototype, "hostilesAndLairs", {
        get: function myProperty() {
            if (!Game.cache.hostilesAndLairs[this.name]) {
                let lairs = _.filter(this.findStructures(STRUCTURE_KEEPER_LAIR), (lair: StructureKeeperLair) => {
                    return !lair.ticksToSpawn || lair.ticksToSpawn < 10;
                });
                Game.cache.hostilesAndLairs[this.name] = lairs.concat(this.hostiles);
            }
            return Game.cache.hostilesAndLairs[this.name];
        }
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
                    }
                    else {
                        this.memory.roomType = ROOMTYPE_ALLEY;
                    }
                }
            }
            return this.memory.roomType;
        }
    });

    /**
     * Returns array of structures, caching results on a per-tick basis
     * @param structureType
     * @returns {Structure[]}
     */
    Room.prototype.findStructures = function(structureType: string): Structure[] {
        if (!Game.cache.structures[this.name]) {
            Game.cache.structures[this.name] = _.groupBy(this.find(FIND_STRUCTURES), (s:Structure) => s.structureType);
        }
        return Game.cache.structures[this.name][structureType] || [];
    };

    /**
     * Finds creeps and containers in room that will give up energy, primarily useful when a storage is not available
     * Caches results on a per-tick basis. Useful before storage is available or in remote mining rooms.
     * @param roomObject - When this optional argument is supplied, return closest source
     * @returns {StructureContainer|Creep} - Returns source with highest amount of available energy, unless roomObject is
     * supplied
     */
    Room.prototype.getAltBattery = function(roomObject?: RoomObject): StructureContainer | Creep {
        if (!this.altBatteries) {
            let possibilities = [];
            let containers = this.findStructures(STRUCTURE_CONTAINER);
            if (this.controller && this.controller.getBattery() instanceof StructureContainer) {
                _.pull(containers, this.controller.getBattery());
            }
            for (let container of containers) {
                if (container.store.energy >= 50) {
                    possibilities.push(container);
                }
            }
            let creeps = this.find(FIND_MY_CREEPS, {filter: (c: Creep) => c.memory.donatesEnergy});
            for (let creep of creeps) {
                if (creep.carry.energy >= 50) {
                    possibilities.push(creep);
                }
            }
            if (this.terminal && this.terminal.store.energy >= 50) {
                possibilities.push(this.terminal);
            }
            this.altBatteries = _.sortBy(possibilities, (p: Creep | StructureContainer) => {
                return p.store.energy;
            });
        }
        if (roomObject) {
            return roomObject.pos.findClosestByRange(this.altBatteries) as StructureContainer | Creep;
        }
        else {
            return _.last(this.altBatteries) as StructureContainer | Creep;
        }
    };


    /**
     * Returns room coordinates for a given room
     * @returns {*}
     */

    Object.defineProperty(Room.prototype, "coords", {
        get: function myProperty() {
            if (!this.memory.coordinates) {
                this.memory.coordinates = helper.getRoomCoordinates(this.name);
            }
            return this.memory.coordinates;
        }
    });
}
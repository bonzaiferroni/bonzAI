import {MINERALS_RAW, PRODUCT_LIST} from "./constants";
import {Empire} from "./Empire";
import {Operation} from "./Operation";

declare var emp: Empire;

export var consoleCommands = {

    sendFromAll(resourceType: string, amount: number, roomName: string) {
        _.forEach(Game.rooms, (room: Room) => {
            if (room.controller && room.controller.level > 6 && room.terminal && room.terminal.my) {
                let outcome = room.terminal.send(resourceType, amount, roomName)
                console.log(room.name, " sent ",amount," to ",roomName);
            }
        })
    },

    removeConstructionSites(roomName: string, leaveProgressStarted = true, structureType?: string) {
        Game.rooms[roomName].find(FIND_MY_CONSTRUCTION_SITES).forEach( (site: ConstructionSite) => {
            if ((!structureType || site.structureType === structureType) &&(!leaveProgressStarted || site.progress === 0)) {
                site.remove();
            }
        })
    },
    removeFlags(substr: string) {
      _.forEach(Game.flags, (flag) => {
          if (_.includes(flag.name, substr) ) {
              console.log(`removing flag ${flag.name} in ${flag.pos.roomName}`);
              flag.remove();
          }
      });
    },
    minv() {
        for (let mineralType of MINERALS_RAW) {
            console.log(mineralType + ":", emp.inventory[mineralType]);
        }
    },
    pinv() {
        for (let mineralType of PRODUCT_LIST) {
            console.log(mineralType + ":", emp.inventory[mineralType]);
        }
    },
    testCode() {
        // test code
    },
    wipeMemory() {
        for (let flagName in Memory.flags) {
            let flag = Game.flags[flagName];
            if (flag) {
                for (let propertyName of Object.keys(flag.memory)) {
                    if (propertyName === "swapMining") continue;
                    if (propertyName === "powerMining") continue;
                    if (propertyName === "power") continue;
                    if (propertyName === "spawnRoom") continue;
                    if (propertyName === "distance") continue;
                    delete flag.memory[propertyName];
                }
            }
            else {
                delete Memory.flags[flagName];
            }
        }

        for (let creepName in Memory.creeps) {
            let creep = Game.creeps[creepName];
            if (!creep) {
                delete Memory.creeps[creepName];
            }
        }
    },
    findResource(resourceType: string) {
        for (let terminal of emp.terminals) {
            if (terminal.store[resourceType]) {
                console.log(terminal.room.name, terminal.store[resourceType]);
            }
        }
    },
    emptyTerminal(origin: string, destination: string) {
        let originTerminal = Game.rooms[origin].terminal;
        let outcome;
        for (let resourceType in originTerminal.store) {
            if (!originTerminal.store.hasOwnProperty(resourceType)) continue;
            let amount = originTerminal.store[resourceType];
            if (amount >= 100) {
                if (resourceType !== RESOURCE_ENERGY) {
                    outcome = originTerminal.send(resourceType, amount, destination);
                    break;
                }
                else if (Object.keys(originTerminal.store).length === 1 ) {
                    let distance = Game.map.getRoomLinearDistance(origin, destination, true);
                    let stored = originTerminal.store.energy;
                    let amountSendable = Math.floor(stored / (1 + 0.1 * distance));
                    console.log("sending", amountSendable, "out of", stored);
                    outcome = originTerminal.send(RESOURCE_ENERGY, amountSendable, destination);
                }
            }

        }
        return outcome;
    },
    changeOpName(opName: string, newOpName: string) {
        let operation = global[opName] as Operation;
        if (!operation) return "you don't have an operation by that name";

        let newFlagName = operation.type + "_" + newOpName;
        let outcome = operation.flag.pos.createFlag(newFlagName, operation.flag.color, operation.flag.secondaryColor);
        if (_.isString(outcome)) {
            Memory.flags[newFlagName] = operation.memory;
            operation.flag.remove();
            return "operation name change successfully, removing old flag";
        }
        else {
            return "error changing name: " + outcome;
        }
    },
    order(resourceType: string, amount: number, roomName: string, efficiency = 10 ) {
        if (!(amount > 0)) {
            return "usage: order(resourceType, amount, roomName, efficiency?)";
        }

        if (Game.map.getRoomLinearDistance("E0S0", roomName) < 0) {
            return "usage: order(resourceType, amount, roomName, efficiency?)";
        }

        if (efficiency <= 0) {
            return "efficiency must be >= 1";
        }

        Memory.resourceOrder[Game.time] = { resourceType: resourceType, amount: amount, roomName: roomName,
            efficiency: efficiency, amountSent: 0};
        return "TRADE: scheduling " + amount + " " + resourceType + " to be sent to " + roomName;
    }
};
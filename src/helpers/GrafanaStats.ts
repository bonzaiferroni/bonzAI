import {Empire} from "../ai/Empire";
import {MINERALS_RAW, PRODUCT_LIST} from "../ai/TradeNetwork";
import {Tick} from "../Tick";
export class GrafanaStats {

    public static run(emp: Empire) {

        if (!Memory.playerConfig.enableStats) { return; }

        if (!Memory.stats) { Memory.stats = {}; }

        // STATS START HERE
        _.forEach(Game.rooms, function (room) {
            if (room.controller && room.controller.my) {
                Memory.stats["rooms." + room.name + ".energyAvailable"] = room.energyAvailable;
            }
        });

        for (let resourceType of MINERALS_RAW) {
            Memory.stats["empire.rawMinerals." + resourceType] = emp.network.inventory[resourceType];
            if (!Tick.cache.mineralCount[resourceType]) { continue; }
            Memory.stats["empire.mineralCount." + resourceType] = Tick.cache.mineralCount[resourceType];
        }

        for (let resourceType of PRODUCT_LIST) {
            Memory.stats["empire.compounds." + resourceType] = emp.network.inventory[resourceType];
            Memory.stats["empire.processCount." + resourceType] = Tick.cache.labProcesses[resourceType] || 0;
        }

        Memory.stats["empire.activeLabCount"] = Tick.cache.activeLabCount;

        Memory.stats["empire.energy"] = emp.network.inventory[RESOURCE_ENERGY];

        for (let storage of emp.network.storages) {
            Memory.stats["empire.power." + storage.room.name] = storage.store.power ? storage.store.power : 0;
        }

        // Profiler check
        for (let identifier in Memory.profiler) {
            let profile = Memory.profiler[identifier];
            Memory.stats["game.prof." + identifier + ".cpt"] = profile.costPerTick;
            Memory.stats["game.prof." + identifier + ".cpc"] = profile.costPerCall;
            Memory.stats["game.prof." + identifier + ".max"] = profile.max;
        }

        Memory.stats["game.cpu.bypassCount"] = Tick.cache.bypassCount;

        Memory.stats["game.time"] = Game.time;
        Memory.stats["game.gcl.level"] = Game.gcl.level;
        Memory.stats["game.gcl.progress"] = Game.gcl.progress;
        Memory.stats["game.gcl.progressTotal"] = Game.gcl.progressTotal;
        Memory.stats["game.cpu.limit"] = Game.cpu.limit;
        Memory.stats["game.cpu.tickLimit"] = Game.cpu.tickLimit;
        Memory.stats["game.cpu.bucket"] = Game.cpu.bucket;
        Memory.stats["game.cpu.used"] = Game.cpu.getUsed();
        Memory.stats["game.cpu.perCreep"] = Game.cpu.getUsed() / Object.keys(Game.creeps).length;
    }
}

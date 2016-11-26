# bonzaiScreeps
> The self-managing AI used by bonzaiferroni at screeps.com

## Installation
Install [typescript](https://www.npmjs.com/package/typescript) and some system for compiling as you code (eg Webstorm)
run `npm install` to setup grunt for pushing code up.

## Goals of bonzaiScreeps
- Well-balanced resource economy
- Effective raiding and defense
- All game decisions made by AI rather than user
- As a long term goal, decision-making that changes based on the results of previous decisions and through random mutations, resulting in novel behavior

## Overview

Files in this codebase can be neatly separated into two categories: 

1. Abstract classes that that make up the **framework**, currently just Operation and Mission along with the supporting concrete classes SpawnGroup and Empire
  - Empire.ts
  - Operation.ts
  - Mission.ts
  - SpawnGroup.ts
  - main.ts
  - loopHelper.ts
2. Concrete classes that extend Operation and Mission that make up the **implementation** of game mechanics / creep behavior. Examples:
  - QuadOperation.ts (bootstrap missions for owned rooms)
  - MiningOpration.ts (bootstrap missions for remote harvesting)
  - PaverMission.ts (repair roads in any room)
  - BodyguardMission.ts (defend against invaders)

### Overview of framework

The archictecture of the framework is readily observed by looking at main.ts and the code contained within the game loop. Creep behavior is always defined in a mission, which also defines the spawning conditions and data-gathering necessary for that class of creeps. Operations are really just a collection of missions that get bootstrapped by placement of a flag in the screep world.

![framework overview](https://docs.google.com/drawings/d/e/2PACX-1vSkzFgLxP8KvcfnKCgeHYgEsPJpSlX2Q2yB03JKrm7UMcRI5Cwi2ZgKhOJ-7PamRqq8UiIgUk4xHJID/pub?w=960&h=720)

Each phase is executed completely for each operation before moving on to the next phase. This allows you to assume, for example, that every `initOperation()` and `initMission()` function has been executed before any `roleCall()` function is executed.

#### Spawn order

For operations that use the same SpawnGroup, `operation.priority` determines which operation will have its creeps spawned first.

Within operations, spawn order for each missions is determined by the order in which they are added to the operation. Take the following `initOperation()` function:

```
initOperation() {

  // creeps for upgrading controller, these will spawn first as they appear sooner in the function
  let boostUpgraders = this.flag.room.controller.level < 8;
  this.addMission(new UpgradeMission(this, boostUpgraders)); 

  // these will only begin to spawn after the creeps in UpgradeMission are fully spawned
  this.addMission(new PaverMission(this)); 
  
}
```

#### Persistent memory

New Operation and Mission objects are instantiated each game tick. Whenever possible, member variables are evaluated by accessing the Game object and its convience properties (i.e., `Game.structures`) . For everything else, persistent memory can be accessed for each Operation through the `operation.memory` and `mission.memory` properties, which are hosted on the flag that is being used to bootstrap the operation.

#### Operation phase functions 

The execution of phase functions follows the pattern demonstrated in the `Operation.init()` function below:

```
init() {
    try { this.initOperation(); }
    catch (e) {
        console.log("error caught in initOperation phase, operation:", this.name);
        console.log(e.stack);
    }

    for (let missionName in this.missions) {
        try { this.missions[missionName].initMission(); }
        catch (e) {
            console.log("error caught in initMission phase, operation:", this.name, "mission:", missionName);
            console.log(e.stack);
        }
    }
}

abstract initOperation();
```

Missions are added to `operation.missions` init the `initOperation()` function. Then, each `mission.initMission()` function gets executed in the order it was added. These are surrounded by try/catch blocks, so that when code fails it will fail gracefully. You needn't worry about errors in one mission causing other operations/missions to cease functioning.

### Overview of AI implementation

This repository includes all the missions/operations that make up the bonzaiferroni AI. Players looking to write a completely original AI can simply take the framework and write their own concrete classes that extend Operation and Mission. 

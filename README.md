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
2. Concrete classes that extend Operation and Mission and make up the **implementation** of game mechanics / creep behavior.

### Overview of framework

The archictecture of the framework is readily observed by looking at main.ts and the code contained within the game loop. Creep behavior is always defined in a mission, which also defines the spawning conditions and data-gathering necessary for that class of creeps. Operations are really just a collection of missions that get bootstrapped by placement of a flag in the screep world.

![framework overview](https://docs.google.com/drawings/d/e/2PACX-1vSkzFgLxP8KvcfnKCgeHYgEsPJpSlX2Q2yB03JKrm7UMcRI5Cwi2ZgKhOJ-7PamRqq8UiIgUk4xHJID/pub?w=960&h=720)

Each phase is executed completely for each operation before moving on to the next phase. This allows you to assume, for example, that every `initOperation()` and `initMission()` function has been executed before any `roleCall()` function is executed.

Additional framework topics:

- [Spawn Order](https://github.com/bonzaiferroni/bonzaiScreeps/wiki/Framework-Overview#spawn-order)
- [Persistent data (memory)](https://github.com/bonzaiferroni/bonzaiScreeps/wiki/Framework-Overview#persistent-data-memory)
- [Phase functions](https://github.com/bonzaiferroni/bonzaiScreeps/wiki/Framework-Overview#operation-phase-functions)

### Overview of AI implementation

This repository includes all the missions/operations that make up the bonzaiferroni AI. Players looking to write a completely original AI can simply take the framework and write their own concrete classes that extend Operation and Mission. 

The following is a summary of the Operations/missions you can find in this repository:

#### Operations

- QuadOperation: Manages all missions relative to an owned room, including upgrading, tower defense, spawn refilling, and more
- MiningOperation: Remote harvesting in non-SK rooms
- KeeperOperation: Remote harvesting in SK rooms
- ConquestOperation: Spawn creeps to be used to settle a new owned-room.

#### Missions

- Defense
  - BodyguardMission: Protect creeps working in non-owned rooms from invaders
  - EnhancedBodyguardMission: Protect creeps from boosted invaders in SK-rooms and cores
- Infrastructure
  - PaverMission: Keep roads repaired
  - TerminalNetworkMission: Trade resources with other rooms and with ally rooms
  - LinkNetworkMission: Send resources around an owned-room
  - BuildMission: Build structures in an owned-room
  - RemoteBuildMission: Build structures in a non-owned-room
  - RefillMission: Refill spawns and extensions with energy
  - IgorMission: Manage labs and special resource use 
- Resource gathering
  - MiningMission: Conducts energy mining activities relative to a single energy source
  - LinkMiningMission: Uses a link to fire energy mined from a source to a storage in an owned-room.
  - EmergencyMiningMission: Builds miners small enough to resume energy in a room that has suffered some critical failure
  - GeologyMission: Like MiningMission, but manages a Mineral source
- Progress
  - UpgradeMission: Upgrade controllers

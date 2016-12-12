# bonzAI
> The self-managing AI used by bonzaiferroni at screeps.com

This is the code running my AI on the MMO programming game [Screeps](https://screeps.com/). Back when I was learning screeps I was always looking for examples of other players code, so hopefully this can be of some use. I'm still actively developing this code and using it on the MMO server. Searching the code to find vulnerabilities in my raiding/defense is fair game!

For people that are interested in using it on a private server or forking it, I've included some information on how it works. If it seems like people are using it, I will expand on this. If you have any problems or something seems really unclear, please raise an issue.

I had only been doing javascript/typescript for a few months when I started this, so if you are wondering why I'm doing certain things it is probably because I don't know any better. Any advice/guidance from experienced programmers is very welcome.



Once you have the code pushed to a screeps server: 

1. Find a room and place a spawn
 * If it has trouble determining a layout based on your room/spawn placement, it will let you know in the console. Just try again, perhaps a room with more space and don't place the spawn too close to a source.
2. Place a flag with the name "quad_myBase"

## Goals of bonzAI
- All game decisions made by AI rather than user
- As a long term goal, decision-making that changes based on the results of previous decisions and through random mutations, resulting in novel behavior

## Current status on goals

At the moment, rooms are still chosen manually, although I've begun the process that the AI will eventually use. This can currently be found in AutoOperation, which will analyze nearby sources and the room layout and choose the best place to start building structures.

## Overview

Files in this codebase can be neatly separated into two categories: 

1. **Framework:** Abstract classes like Operation and Mission along with the supporting classes SpawnGroup and Empire
2. **Implementation:** Concrete classes that extend Operation and Mission and make up the of game mechanics / creep behavior.

### Overview of framework

Depending on whether you want to write code using this framework or just understand my own code so you can easily take down my rooms, it will help to know about the framework.

The archictecture of the framework is best understood by looking at main.ts and the code within `module.exports.loop`. The following figure shows how phases (init, roleCall, actions, finalize) are executed within the loop.

![framework overview](https://docs.google.com/drawings/d/e/2PACX-1vSkzFgLxP8KvcfnKCgeHYgEsPJpSlX2Q2yB03JKrm7UMcRI5Cwi2ZgKhOJ-7PamRqq8UiIgUk4xHJID/pub?w=960&h=720)

Each phase is executed completely for each operation before moving on to the next phase. This allows you to assume, for example, that every `initOperation()` and `initMission()` function has been executed before any `roleCall()` function is executed.

Creep behavior is always defined in a mission, which also defines the spawning conditions and data-gathering necessary for that class of creeps. Operations are really just a collection of missions that get bootstrapped by placement of a flag in the screep world.

Additional framework topics:

- [Spawn Order](https://github.com/bonzaiferroni/bonzaiScreeps/wiki/Framework-Overview#spawn-order)
- [Persistent data (memory)](https://github.com/bonzaiferroni/bonzaiScreeps/wiki/Framework-Overview#persistent-data-memory)
- [Phase functions](https://github.com/bonzaiferroni/bonzaiScreeps/wiki/Framework-Overview#operation-phase-functions)
- SpawnGroup (coming soon)
- Empire (coming soon)
- Cache invalidation (coming soon)
- Tutorial: Write a couple classes that extends Operation and Mission to do all the basic creep behavior (harvesting, building construction, etc.) (coming soon)

### Overview of AI implementation

This repository includes all the missions/operations that make up the bonzaiferroni AI. Players looking to write a completely original AI can simply take the framework and write their own concrete classes that extend Operation and Mission. 

The following is a summary of the Operations/missions you can find in this repository:

#### Operations

- QuadOperation: Manages all missions relative to an owned room, including upgrading, tower defense, spawn refilling, and more
- FlexOperation: All the functions of QuadOperation but uses a flexible layout that is compatible with a wider variety of rooms
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


## Installation
run `npm install` to install dependencies.

Create a copy of `config.example.json` and rename it to `config.json`.

Then, on the `config.json` file, change the `username` and `password` properties with your Screeps credentials.
The `config.json` file is where you set up your development environment. If you want to push your code to another branch, for example.




## Notes

### Gulp Tasks
A variety of gulp tasks have been provided...

 - `lint` runs TSLint against /src/*
 - `compile-bundled` compiles the code into a single 'main.js' file in the /dist folder.
 - `compile-flattened` compiles the code into the /dist folder but emits any folder structure (required for screeps)
 - `upload` compiles according to your config.json file and uploads to the defaultTarget.
 - `copyLocal` compiles according to your config.json file and copies the result to the local directory
 - `watchUpload` compiles and uploads to the server when a file is saved in your src directory.
 - `watchLocal` compiles and copies to your local path when a file is saved in your src directory.

you can run gulp tasks in the terminal... ` gulp copyLocal `;

tasks are defined in gulpfile.js and you can read more about gulp here...
http://gulpjs.com/


### TSLint

TSLint checks your TypeScript code for readability, maintainability, and functionality errors, and can also enforce coding style standards.
After each successful compiling of the project, TSLint will parse the TypeScript source files and display a warning for any issues it will find.
This project provides TSLint rules through a `tslint.json` file, which extends the recommended set of rules from TSLint github repository: https://github.com/palantir/tslint/blob/next/src/configs/recommended.ts
Some changes to those rules, which were considered necessary and/or relevant to a proper Screeps project:

 - set the [forin](http://palantir.github.io/tslint/rules/forin/) rule to `false`, it was forcing `for ( ... in ...)` loops to check if object members were not coming from the class prototype.
 - set the [interface-name](http://palantir.github.io/tslint/rules/interface-name/) rule to `false`, in order to allow interfaces that are not prefixed with `I`.
 - set the [no-console](http://palantir.github.io/tslint/rules/no-console/) rule to `false`, in order to allow using `console`.
 - in the [variable-name](http://palantir.github.io/tslint/rules/variable-name/) rule, added `allow-leading-underscore`.

**More info about TSLint:** https://palantir.github.io/tslint/
///import {Progress2} from './Progression.js';
const input = require("readline-sync");
let MonsterNames = ["Jake","Paul","Tom",];
function HUD() {
  console.log("--------------------------------------------------------------\nLocation:",Location,);
  console.log(" Name:",Character1.Name,"\n","Health:",Character1.HP,"\n","Race:",Character1.Race,"\n","Class:",Character1.Class,"\n--------------------------------------------------------------\n");
}

let Start = [""];
let Races = ["Human"];
let Classes = ["Warrior", "Mage","Thief","Bard"]
let Location = ["Town"];
let Character1 = {
  Name:  " ",
  Race:  " ",
  Class:  " ",
  Level:  1,
  HP: 1,
  Strength: 1,
  MaxHP: 100,
  Progress: 1,
};
Character1.Name = input.question("Please enter your name... \n\n");

console.log("Characters name is", Character1.Name,"\n\n");


  console.log("Please Choose a Race\n");
for (i = 0; i < Races.length; i++) {
  console.log(Races[i]);
}
Character1.Race = input.question("\n");

console.log("Please Choose a Class\n");
for (i = 0; i < Classes.length; i++) {
  console.log(Classes[i]);
}
Character1.Class = input.question("\n");

Start = input.question("Would you like to Begin? (Y/N)\n");
if (Start = "Y") {
HUD();
MOVING();
}











////////////////////////Function Storage/////////////
function CreateMonster() {
let R = Math.floor(Math.random() * 3);
let MonsterHP = (Math.random() * 30) * Character1.Level;
let Monster1 = {
MonsterName: MonsterNames[Math.floor(Math.random()*MonsterNames.length)],
MonsterMaxHP: MonsterHP,
MonsterLevel: (R + Character1.Level),
MonsterXP: (MonsterHP/2),
};
if (Monster1.MonsterHP <= 10) {
  CreateMonster();
};
if (Monster1.MonsterLevel == 0) {
  CreateMonster();
};
};
function MOVING(){
  let EncounterChance = Math.floor(Math.random() * 10) + 1;
  let Choice;
  console.log("1. Move Forwards.\n");
  console.log("2. Rest.\n");
  console.log("3. Move Backwards.\n");
  console.log("4. Search\n");
Choice = input.question("...\n");
///Maybe use a switch for this?
  if (Choice == 1){
Character1.Progress++
if (EncounterChance >= 5) {
  //run create montser Function here
  CreateMonster();
  CombatHUD();
}
  }
  if (Choice == 2) {
    //Rest and Gain Health,Day Progresses.
  }
  if (Choice == 3) {
Character1.Progress--
Character.search = !bool;
  }
  if (Choice == 4) {
    console.log("You Search the Area for Anything Useful\n");
    if (Character1.Progress = 2) {
  ///Run Event for Second Space
    }
    else {
      console.log("You dont see anything Interesting\n");
    }
    }
    console.log('\n'.repeat('75'));
    HUD();
    MOVING();
    };
  function CombatHUD() {/////Need to create this again since i broke it last time.
  };
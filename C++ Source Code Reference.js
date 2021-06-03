#include "Character.h"

//add Random Race Option Skribblebrap
///// THIS IS My MAIN C++ FILE IT HAS EVERYTHING THAT WE SHOULD PORT TO JAVASCRIPT
///// INCLUDING RANDOM ENCOUNTERS WITH MONSTERS AND TRADERS
//// AN INVENTORY SYSTEM, A BATTLE SYSTEM with attacks blocks and leveling up, A MONSTER TAMING SYSTEM, and progress tracker with events.  CNTRL F the voids to find anything specific.
void HUD();
void Combat();
void CombatHUD();
void Moving();
void createMonster();
void LevelUp();
void createItem();
void createBoss();
void Tame();
void Party1LevelUp();

using namespace std;

bool monsterTamed;
int monsterTame = 0;
int monsterMaxHP = 0;
int monsterHp = 0;
int monsterXp = 0;
int monsterLevel = 0;
int progress = 0;

std::string monsterName[] = { "Goblin", "Dwarf", "Ogre", "Witch", "Demon", "Wraith", "Tom", };
int currentMonsterNames = 7;
std::string currentMonster = " ";


std::string itemName[] = { "Green Herb", "Yellow Herb", "Red Herb", "Winrys Paw", "Andis Paw", "Weed", "Kushberries" };
int currentItemNames = 7;
std::string currentItem = " ";

std::string tomVerb[] = { "smell like", "look like", "eat", "borrow", "steal", "drive", "burn", "slap", "collect", "melt", "draw", "scream at", "lick", "suck on", "drink", "hear", };
int currentTomVerbs = 16;
std::string currentVerb = " ";

std::string tomAdjectives[] = { "burnt", "hot", "cold", "wet", "leftover", "strawberry", "banana", "gravy", "smelly", "ugly","loose","long","short","ancient","several","black","thick",};
int currentTomAdjectives = 17;
std::string currentAdjective = " ";

std::string tomNouns[] = { "beans", "socks", "pancakes", "pancake batter", "peels", "gravy", "toes", "clothes", "medicine", "pizza","legs", "arms", "pussy", "milk", "syrup","potatoes","coffee","honey","polution",};
int currentTomNouns = 19;
std::string currentNoun = " ";

std::string tomAmounts[] = { "a", "two", };
int currentTomAmounts = 2;
std::string currentAmount = " ";

std::vector<std::string> playerInventory{ "Green Herb",};
std::string playerEquip[] = { "Knife", };

std::vector<std::string> playerSkills{ "Blaze", };

std::vector<std::string> playerHerbs = { "Green Herb", "Red Herb", "Yellow Herb" };

std::vector<std::string> playerFlowers = { "Winrys Paw", "Andis Paw", "Weed", };

//std::string playerParty[] = { " ", " ", " "};
//int currentplayerParty = 3;
//std::string currentPlayer = " ";

int counter = 0;



Character character;



int main() {
	
	srand((unsigned int)time(NULL));
	character.CharacterCreation();

	HUD();
	Moving();

	system("pause");

	return 0;

}

void HUD() {
	if (character.progress)
	Sleep(500);
	system("cls");
	std::cout << "Name: " << character.name << " | Health: " << character.totalHealth << " | Progress: " << character.progress << " ||| " << "Name: " << character.party1 << "\nRace: " << character.race << "                            |||" << " Health: " << character.party1Hp
	<< "\nSex: " << character.sex << "                              |||" << " Level: " << character.party1L << "\nLevel: " << character.level << "                               |||" << " Xp: " << character.party1CurrentXp <<  "\nxp: " << character.current_xp << "\nxp to next Level: " << character.xp_to_level << "                   |||" << character.party1Xp_to_Level << std::endl;
	std::cout << "--------------------------------------------------------------------------------------------------------";
	Moving();
}

void CombatHUD() {

	
	Sleep(500);
	system("cls");

std::cout << "Name: " << character.name << " --- " << character.party1 << " 		|		Monster Name: " << currentMonster << "\nHealth: " << character.totalHealth << " --- " << character.party1Hp << "   		|		Monster Health: " <<
monsterHp << "\nLevel: " << character.level << " --- " << character.party1L << "    		|		Monster Level: " << monsterLevel << std::endl;

}

void Combat() {

	CombatHUD();

	int a = rand() % 2 + 1;
	int playerAttack;
	int tamedAttack;
	int playerDamage = (16 * character.level / 2) + character.strength + character.weapon + a;
	int playerBlaze = (20 * character.level / 2) + a;
	int monsterAttack = 6 * monsterLevel / 2;
	int tamedDamage = 6 * character.party1L / 2;

	if (character.totalHealth >= 1 && monsterHp >= 1) {
		std::cout << "\n";
		std::cout << character.name << "---\n";
		std::cout << "\n";
		std::cout << "1. Attack.\n";
		std::cout << "2. Skills.\n";
		std::cout << "3. Block.\n";
		std::cout << "4. Run.\n";
		std::cout << "5. Tame.\n";
		std::cout << "\n";
		std::cin >> playerAttack;

		if (playerAttack == 1) {
			//Attack
			int x = rand() % 100 + 1;

			if (x <= 5) {
				std::cout << "Critical Hit!!! You did " << playerDamage * 2 << " to the " << currentMonster << std::endl;
				monsterHp = monsterHp - playerDamage;
				Sleep(1000);
				CombatHUD();

			}
			else std::cout << "Attacking... you did " << playerDamage << " to the " << currentMonster << std::endl;
			monsterHp = monsterHp - playerDamage;
			if (monsterTamed = true) {
				if (character.party1Hp >= 1 && monsterHp >= 1) {
					std::cout << "\n";
					std::cout << character.party1 << "---\n";
					std::cout << "\n";
					std::cout << "1. Attack.\n";
					std::cout << "2. Block.\n";
					std::cout << "\n";
					std::cin >> tamedAttack;

					if (tamedAttack == 1) {
						int x = rand() % 100 + 1;
						if (x <= 5) {
							std::cout << "Critical Hit!!! " << character.party1 << " did " << tamedDamage * 2 << " to the " << currentMonster << std::endl;
							monsterHp = monsterHp - tamedDamage;
							Sleep(1000);
							CombatHUD();
						}
						else std::cout << character.party1 << " did " << tamedDamage << " to the " << currentMonster << std::endl;
						monsterHp = monsterHp - tamedDamage;
					}
				}
			}


			if (monsterHp >= 1) {

				int x = rand() % 100 + 1;

				std::cout << "\n";
				std::cout << "Monster is Attacking...\n\n";
				if (monsterTamed = true) {
					if (x >= 50) {
						character.totalHealth = character.totalHealth - monsterAttack;
						std::cout << "You suffered " << monsterAttack << " damage!\n" << " Remaining HP " << character.totalHealth << std::endl;
					}
					if (x < 50) {
						character.party1Hp = character.party1Hp - monsterAttack;
						std::cout << character.party1 << " suffered " << monsterAttack << " damage!\n" << " Remaining HP " << character.party1Hp << std::endl;
					}
				}
				if (monsterTamed = false) {
					character.totalHealth = character.totalHealth - monsterAttack;
					std::cout << "You suffered " << monsterAttack << " damage!\n" << " Remaining HP " << character.totalHealth << std::endl;
				}
				//Change to fuction -- dont remember this
				if (character.totalHealth <= 0) {
					character.totalHealth = 0;

				}
			}
			else if (monsterHp <= 0) {
				monsterHp = 0;
				if (monsterTamed == false) {
					std::cout << "\n";
					std::cout << "Defeated " << currentMonster << "!\n" << "You Receive " << monsterXp << " XP! Nice!";
					//Loot drop chance should go here. Probably very low chance for loot.
					int i = rand() % 100 + 1;
					if (i <= 15) {
						std::cout << "\n\n";
						std::cout << "The Enemy dropped an item!\n";
						std::string tempName = itemName[rand() % currentItemNames];
						std::cout << tempName << " was added to inventory" << "!\n";
						playerInventory.push_back(tempName);
					}
					if (character.level != character.maxLevel) {
						character.current_xp += monsterXp;
						LevelUp();
					}
				}
				if (monsterTamed == true) {
					std::cout << "\n";
					std::cout << "Defeated " << currentMonster << "!\n" << "Your team received " << monsterXp << " XP! Nice!";
					//Loot drop chance should go here. Probably very low chance for loot.
					int i = rand() % 100 + 1;
					if (i <= 15) {
						std::cout << "\n\n";
						std::cout << "The Enemy dropped an item!\n";
						std::string tempName = itemName[rand() % currentItemNames];
						std::cout << tempName << " was added to inventory" << "!\n";
						playerInventory.push_back(tempName);
					}
					if (character.level != character.maxLevel) {
						character.current_xp += (monsterXp / 2);
					}
					if (character.party1L != character.party1ML) {
						character.party1CurrentXp += (monsterXp / 2);
						LevelUp();
						Party1LevelUp();
					}
				}
			}
			Sleep(3000);
			Combat();
		}
		else if (playerAttack == 2) {
			//Loop for printing Player SKills
			char sChoice;

			std::cout << "Available Skills.\n";
			std::cout << "____________________________\n";
			for (int i = 0; i < playerSkills.size(); i++) {
				std::cout << i + 0 << ". " << playerSkills[i] << "\n";
			}
			std::cout << "____________________________\n\n";
			std::cout << "Choose a Skill to use. ( Example: b = Blaze )\n\n";
			std::cin >> sChoice;

			switch (sChoice) {

			case 'b':
			{
				if (std::count(playerSkills.begin(), playerSkills.end(), "Blaze")) {
					std::cout << "You let loose a jet of Flames!\n";
					Sleep(500);
					std::cout << "You did " << playerBlaze << " to the " << currentMonster << std::endl;
					monsterHp = monsterHp - playerBlaze;
					Sleep(1000);
				}
				else {
					std::cout << "You dont know any spells!\n";
					Sleep(1000);
					CombatHUD();
				}
			}

			}
			if (monsterTamed = true) {
				if (character.party1Hp >= 1 && monsterHp >= 1) {
					std::cout << "\n";
					std::cout << character.party1 << "---\n";
					std::cout << "\n";
					std::cout << "1. Attack.\n";
					std::cout << "2. Block.\n";
					std::cout << "\n";
					std::cin >> tamedAttack;

					if (tamedAttack == 1) {
						int x = rand() % 100 + 1;
						if (x <= 5) {
							std::cout << "Critical Hit!!! " << character.party1 << " did " << tamedDamage * 2 << " to the " << currentMonster << std::endl;
							monsterHp = monsterHp - tamedDamage;
							Sleep(1000);
							CombatHUD();
						}
						else std::cout << character.party1 << " did " << tamedDamage << " to the " << currentMonster << std::endl;
						monsterHp = monsterHp - tamedDamage;
					}
				}

			Sleep(1000);
			Combat();
		}
			if (monsterHp >= 1) {

				int x = rand() % 100 + 1;

				std::cout << "\n";
				std::cout << "Monster is Attacking...\n\n";
				if (monsterTamed == true) {
					if ((currentMonster == "Tom") && x >= 50) {
						std::cout << "The Tom Let Loose a Tommism." << std::endl;
						std::string tempName0 = tomVerb[rand() % currentTomVerbs];
						std::string tempName1 = tomAdjectives[rand() % currentTomAdjectives];
						std::string tempName2 = tomNouns[rand() % currentTomNouns];
						//std::string tempName3 = tomAmounts[rand() % currentTomAmounts];
						std::cout << "The Tom " << tempName0 << " " /*<< tempName3 << " "*/ << tempName1 << " " << tempName2 << "!\n";
						Sleep(2000);
					}
					if (x >= 50) {
						character.totalHealth = character.totalHealth - monsterAttack;
						std::cout << "You suffered " << monsterAttack << " damage!\n" << " Remaining HP " << character.totalHealth << std::endl;
					}
					if (x < 50) {
						character.party1Hp = character.party1Hp - monsterAttack;
						std::cout << character.party1 << " suffered " << monsterAttack << " damage!\n" << " Remaining HP " << character.party1Hp << std::endl;
					}
				}
				if (monsterTamed == false) {
					character.totalHealth = character.totalHealth - monsterAttack;
					std::cout << "You suffered " << monsterAttack << " damage!\n" << " Remaining HP " << character.totalHealth << std::endl;
				}
				//Change to fuction -- dont remember this
				if (character.totalHealth <= 0) {
					character.totalHealth = 0;

				}
			}
			else if (monsterHp <= 0) {
				monsterHp = 0;
				if (monsterTamed == false) {
					std::cout << "\n";
					std::cout << "Defeated " << currentMonster << "!\n" << "You Receive " << monsterXp << " XP! Nice!";
					//Loot drop chance should go here. Probably very low chance for loot.
					int i = rand() % 100 + 1;
					if (i <= 15) {
						std::cout << "\n\n";
						std::cout << "The Enemy dropped an item!\n";
						std::string tempName = itemName[rand() % currentItemNames];
						std::cout << tempName << " was added to inventory" << "!\n";
						playerInventory.push_back(tempName);
					}
					if (character.level != character.maxLevel) {
						character.current_xp += monsterXp;
						LevelUp();
					}
				}
				if (monsterTamed == true) {
					std::cout << "\n";
					std::cout << "Defeated " << currentMonster << "!\n" << "Your team received " << monsterXp << " XP! Nice!";
					//Loot drop chance should go here. Probably very low chance for loot.
					int i = rand() % 100 + 1;
					if (i <= 15) {
						std::cout << "\n\n";
						std::cout << "The Enemy dropped an item!\n";
						std::string tempName = itemName[rand() % currentItemNames];
						std::cout << tempName << " was added to inventory" << "!\n";
						playerInventory.push_back(tempName);
					}
					if (character.level != character.maxLevel) {
						character.current_xp += (monsterXp / 2);
					}
					if (character.party1L != character.party1ML) {
						character.party1CurrentXp += (monsterXp / 2);
						LevelUp();
						Party1LevelUp();
					}
				}
			}
			Sleep(3000);
			Combat();
		}
		else if (playerAttack == 3) {
			//Block
			std::cout << "Blocking!\n";
			int i = rand() % 100 + 1;
			if (i >= 50) {
				std::cout << "You Blocked the incoming attack\n";
				character.heal = character.level * 10 / 2;
				std::cout << "You have regained " << character.heal << " health" << std::endl;
				character.totalHealth += character.heal;
				Sleep(3000);
				Combat();
			}
			else {
				std::cout << "You Failed to block the incoming attack\n";
				character.totalHealth -= monsterAttack;
				std::cout << "You received " << monsterAttack << " Damage!" << " Current HP " << character.totalHealth << std::endl;
				Sleep(3000);
				Combat();
			}
		}
		else if (playerAttack == 4) {
			std::cout << "You attempt to run!\n";
			int x = rand() % 100 + 1;
			if (x >= 50) {
				std::cout << "You ran away!\n";
				Sleep(3000);
				HUD();
			}
			else {
				std::cout << "You Couldnt Escape!\n";
				std::cout << "The Enemy unleashes a Savage Attack!\n";
				character.totalHealth -= monsterAttack + 10;
				std::cout << "You suffered " << monsterAttack + 10 << "Damage!\n" << "Current HP " << character.totalHealth << std::endl;
				Sleep(5000);
				Combat();
			}
			//run
		}
		else if (playerAttack == 5) {

			int t = rand() % 100 + 1;
			int monsterTameChance = 5;

			{
				std::cout << "You attempt to tame the monster!\n\n";
				std::cout << t << "Roll\n";


				if (monsterHp <= (monsterMaxHP / 4)) {
					monsterTameChance = 40;
					if (t <= monsterTameChance) {
						std::cout << "You have successfully tamed " << currentMonster << "!\n\n";
						std::cout << monsterTameChance;
						Tame();
						Sleep(2000);
						HUD();
					}
					else if (t > monsterTameChance) {
						std::cout << "The monster is too wild to tame!\n\n";
						std::cout << monsterTameChance << "Chance\n";
						Sleep(2000);
						Combat();
					}
				}
				if (monsterHp <= (monsterMaxHP / 3)) {
					monsterTameChance = 30;
					if (t <= monsterTameChance) {
						std::cout << "You have successfully tamed " << currentMonster << "!\n\n";
						std::cout << monsterTameChance;
						Tame();
						Sleep(2000);
						HUD();
					}
					else if (t > monsterTameChance) {
						std::cout << "The monster is too wild to tame!\n\n";
						std::cout << monsterTameChance << "Chance\n";
						Sleep(2000);
						Combat();
					}

				}
				if (monsterHp <= (monsterMaxHP / 2)) {
					monsterTameChance = 20;
					if (t <= monsterTameChance) {
						std::cout << "You have successfully tamed " << currentMonster << "!\n\n";
						std::cout << monsterTameChance;
						Tame();
						Sleep(2000);
						HUD();
					}
					else if (t > monsterTameChance) {
						std::cout << "The monster is too wild to tame!\n\n";
						std::cout << monsterTameChance << "Chance\n";
						Sleep(2000);
						Combat();
					}
				}
				std::cout << "The Monster is too wild to tame!\n\n";
				Sleep(1000);
				Combat();
			}
		}

		else {
			std::cout << "Invalid Number\n";
			Sleep(500);
			Combat();
		}

		if (character.totalHealth <= 1) {
			system("cls");
			std::cout << "You Died!\n\n\n You were Level: " << character.level << " You progressed " << character.progress << " spaces." << " And were killed by " << currentMonster << std::endl;
			Sleep(2000);
			exit(0);
		}
	}
}

void Moving() {

			int choice; //handles the directional input.

			std::cout << "\n\n";
			std::cout << "1. Move Forward.\n";
			std::cout << "2. Rest.\n";
			std::cout << "3. Move Backwards.\n";
			std::cout << "4. Search the Area.\n";
			std::cout << "5. Inventory\n";
			std::cout << "6. Tommism.\n";
			std::cout << "\n\n";

			std::cin >> choice;


			if (choice == 1) {

				character.progress++;
				character.search--;
				int temp = rand() % 100 + 1;
				std::cout << "You begin moving forward...\n";
				if (temp >= 50) {
					//Encounter a monster
					createMonster();
					monsterMaxHP = monsterHp;
					std::string tempName = monsterName[rand() % currentMonsterNames];
					std::cout << "A " << tempName << " appeared! Prepare to Fight!\n";
					currentMonster = tempName;
					Sleep(1000);
					Combat();
				}
				std::cout << "You find nothing of interest.\n";
				std::cout << "Current Location" << character.progress;
				Sleep(1000);
				HUD();

			}
			else if (choice == 2) {

				int choiceG;
				int choiceR;


				if (std::find(playerInventory.begin(), playerInventory.end(), "Green Herb") != playerInventory.end()) {
					/* if Vector contains x */
					if (character.totalHealth < character.maxHealth) {
						std::cout << "Would you Like to use a Green Herb?\n";
						std::cout << " 1 for Yes\n";
						std::cout << " 2 for No\n\n";
						std::cin >> choiceG;

						if (choiceG == 1) {
							character.totalHealth = character.totalHealth + 20;
							if (character.totalHealth >= character.maxHealth) {
								character.totalHealth = character.maxHealth;
							}
							auto itr = std::find(playerInventory.begin(), playerInventory.end(), "Green Herb");
							if (itr != playerInventory.end()) playerInventory.erase(itr);
							std::cout << "Using a Green Herb" << "...\n";
							Sleep(500);
							std::cout << "...\n";
							Sleep(500);
							std::cout << "...\n";
							Sleep(500);
							std::cout << "...\n";

						}
						else if (choiceG == 2) {
							std::cout << "Do you want to set up camp for the evening?\n";
							if (character.totalHealth <= 99) {
								character.totalHealth += 10 * character.level;
							}
							std::cout << "You Healed by resting. Health is now " << character.totalHealth << std::endl;
							Sleep(2500);
							HUD();
						}
					}

				}

				std::cout << "You want to set up camp for the evening\n\n";
				if (character.totalHealth <= 99) {
					character.totalHealth += 10 * character.level;
				}
				std::cout << "You Healed by resting. Health is now " << character.totalHealth << std::endl;
				Sleep(3000);
				HUD();
			}
			else if (choice == 3) {
				character.progress--;
				int temp = rand() % 100 + 1;
				std::cout << "You Move back to where you came.\n";
				if (temp >= 50) {
					//Encounter a monster
					createMonster();
					std::string tempName = monsterName[rand() % currentMonsterNames];
					std::cout << "A " << tempName << " Prepare to Fight!\n";
					currentMonster = tempName;
					Sleep(1000);
					Combat();
				}
				std::cout << "You find nothing of interest.\n";
				Sleep(1000);
				HUD();


			}
			else if (choice == 4) {

				int temp = rand() % 100 + 1;
				std::cout << "You Search the area for anything usefull...\n\n";

				if (character.progress == 3) {
					std::cout << "You notice a Hooded Stranger following you not too far behind.\n\n";
					std::cout << "What do you do?\n\n";
					std::cout << "1. Confront\n";
					std::cout << "2. Eat his ass\n";
					std::cout << "3. Keep Moving\n";

					std::cin >> choice;
					//unfinished encounter

					if (choice == 1) {
						std::cout << "You confront him.\n";
						std::cout << "The Hooded Stranger acknowledges you and opens up his trenchcoat revealing bags of leafy green substances.\n";
						std::cout << "He offers to sell you some of his Kush Berries.\n\n\n";
						std::cout << "1. Buy them.\n";
						std::cout << "2. Refuse.\n";

						std::cin >> choice;
						//need to create Currency to buy things and add the item to inventory.
						if (choice == 1) {
							std::cout << "You bought Kush Berries!\n";
							playerInventory.push_back("Kush Berries");
						}
						Sleep(1000);
						HUD();
					}
					if (choice == 2) {
						std::cout << "You eat his ass and he lets you pass\n";
						std::cout << "Also he gives you a bag of Grass\n";
						playerInventory.push_back("Kush Berries");
						Sleep(1000);
						HUD();
					}
					if (choice == 3) {
						std::cout << "You ignore him and keep moving forward";
						Sleep(1000);
						HUD();
					}
				}
				if (temp <= 20 && character.search <= 0) {
					//Pick up item
				 // Still need to make this
					std::string tempName = itemName[rand() % currentItemNames];
					std::cout << " You found an " << tempName << "!\n";
					playerInventory.push_back(tempName);
					character.search++;
					Sleep(1000);
					HUD();
				}
				else if (character.search >= 1) {
					std::cout << "You have already searched this area.\n";
					Sleep(2000);
					HUD();
				}
				else {
					std::cout << "You find nothing of interest.\n";
					character.search = 1;
					Sleep(1000);
					HUD();
				}
			}
			else if (choice == 5) {
				//creating for loop for printing playerinventory
				char choiceInv;
				string Green_Herb = "Green Herb";
				string Red_Herb = "Red Herb";

				std::cout << "You search your Bag...\n";
				std::cout << "____________________________\n";
				for (int i = 0; i < playerInventory.size(); i++) {
					std::cout << i + 0 << ". " << playerInventory[i] << "\n";
				}
				std::cout << "____________________________\n\n";
				std::cout << "Choose an Herb to use. ( g = Green Herb, r = Red Herb)\n\n";
				std::cin >> choiceInv;

				switch (choiceInv) {

				case 'g':
				{
					if (std::count(playerInventory.begin(), playerInventory.end(), Green_Herb)) {

						character.totalHealth = character.totalHealth + 20;
						if (character.totalHealth >= character.maxHealth) {
							character.totalHealth = character.maxHealth;
						}
						auto itr = std::find(playerInventory.begin(), playerInventory.end(), Green_Herb);
						if (itr != playerInventory.end()) playerInventory.erase(itr);
						std::cout << "Using a Green Herb" << "...\n";
						Sleep(500);
						std::cout << "...\n";
						Sleep(500);
						std::cout << "...\n";
						Sleep(500);
						std::cout << "...\n";
						Sleep(1000);
						HUD();
					}
					else {
						std::cout << "Green Herb not found!\n";
						Sleep(1500);
						HUD();
					}
				}

				case 'r':
				{
					if (std::count(playerInventory.begin(), playerInventory.end(), Red_Herb)) {

						character.totalHealth = character.totalHealth + 40;
						if (character.totalHealth >= character.maxHealth) {
							character.totalHealth = character.maxHealth;
						}
						auto itr = std::find(playerInventory.begin(), playerInventory.end(), Red_Herb);
						if (itr != playerInventory.end()) playerInventory.erase(itr);
						std::cout << "Using a Red Herb" << "...\n";
						Sleep(500);
						std::cout << "...\n";
						Sleep(500);
						std::cout << "...\n";
						Sleep(500);
						std::cout << "...\n";

						Sleep(1000);
						HUD();
					}
					else {
						std::cout << "Red Herb not found!\n";
						Sleep(1500);
						HUD();
					}
				}
				}
			}
			else if (choice == 6) {
				//Make Singular and Plural noun arrarys, based on currentTomAmounts.
				std::string tempName0 = tomVerb[rand() % currentTomVerbs];
				std::string tempName1 = tomAdjectives[rand() % currentTomAdjectives];
				std::string tempName2 = tomNouns[rand() % currentTomNouns];
				//std::string tempName3 = tomAmounts[rand() % currentTomAmounts];
				std::cout << "You " << tempName0 << " " /*<< tempName3 << " "*/ << tempName1 << " " << tempName2 << "!\n";
				Sleep(2000);
				HUD();
			}
			else {
				std::cout << "Invalid Number\n";
				Sleep(500);
				Moving();
			}
		}

void LevelUp() {
	//add option to increase skills manually

	if (character.current_xp >= character.xp_to_level) {
		character.xp_to_level += floor(character.level + 100 * pow(2, character.level / 7));
		character.totalHealth = floor(character.totalHealth + 13 * pow(2, character.level / 8));

		if (character.level >= character.minLevel && character.level <= character.maxLevel) {
			character.level++;
		}
		else {
			character.level = 60;
		}
	
		character.maxHealth = character.totalHealth;
		std::cout << "\n___________________________________________________________________\n\n";
		std::cout << "You have Leveled up!!! You are now level " << character.level << "!\n" << std::endl;
		std::cout << "Your Health has increased!\n";
		std::cout << "Total Max Health is now " << character.totalHealth << "!\n" << std::endl;

		Sleep(2000);
		LevelUp();
		Party1LevelUp();
	
	}
	Sleep(3500);
	HUD();
}

void Party1LevelUp() {


	//add option to increase skills manually

	if (character.party1CurrentXp >= character.party1Xp_to_Level) {
		character.party1Xp_to_Level += floor(character.party1L + 100 * pow(2, character.party1L / 7));
		character.party1MaxHp = floor(character.party1MaxHp + 10 * pow(2, character.party1L / 8));

		if (character.party1L >= character.party1MinL && character.party1L <= character.party1ML) {
			character.party1L++;
		}
		else {
			character.party1L = 60;
		}

		character.party1Hp = character.party1MaxHp;
		std::cout << "\n___________________________________________________________________\n\n";
		std::cout << character.party1 << " has leveled up!!!" << character.party1 << " is now level " << character.party1L << "!\n" << std::endl;
		std::cout << character.party1 << "s health has increased!\n";
		std::cout << "Total Max Health is now " << character.party1MaxHp << "!\n" << std::endl;

		Sleep(200);
		Party1LevelUp();
		LevelUp();

	}
	Sleep(3500);
	HUD();
}

void createMonster() {

	monsterHp = 30;

	monsterLevel = (rand() % 3) + character.level;

	monsterHp = (rand() % 30) * monsterLevel;

	monsterXp = monsterHp / 2;

	if (monsterHp <= 10)
		createMonster();
	if (monsterLevel == 0)
		createMonster();
}

void createBoss() {
	monsterHp = 200;

	monsterLevel = (rand() % 3) + character.level;

	monsterHp = (rand() % 30) * monsterLevel;

	monsterXp = monsterHp / 2;

	if (monsterHp <= 10)
		createBoss();
	if (monsterLevel == 0)
		createBoss();
}

void Tame()
{
	character.party1 = currentMonster;
	character.party1Hp = monsterMaxHP;
	character.party1MaxHp = character.party1Hp;
	character.party1L = monsterLevel;
	bool monsterTamed = true;

}



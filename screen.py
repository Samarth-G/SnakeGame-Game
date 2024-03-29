from tkinter import *
import random
import math
import time

GAME = True
BLOCK = 35
HEIGHT = BLOCK * 15
WIDTH = HEIGHT
FRAMERATE = 150

snakeParts = []
snakeCoord = []
foodCoord = []
endCards = []

numOfLine = math.floor(HEIGHT/BLOCK)
mid = math.floor(numOfLine/2)

food = 0
score = 1
highScore = 1

facing = "UP"
path_to_score = "/Users/admin/PycharmProjects/FunTime/SnakeGame/highscore.txt"

window = Tk()
window.title("Snake Game")

scoreDisplay = Label(window, anchor=W, text="Size: 1",
                    font=("", 25), bg="black", bd=10, 
                    highlightcolor="white", 
                    fg="white", padx=10, pady=10)

grid = Canvas(height=HEIGHT, width=WIDTH, highlightthickness=0, bg="black", bd=0)
grid.pack(side="bottom")
scoreDisplay.pack(side="top", fill=X)

def createGrid():
    for i in range(15):
        grid.create_line(i*BLOCK, 0, i*BLOCK, HEIGHT, fill="grey20")
        grid.create_line(0, i*BLOCK, WIDTH, i*BLOCK, fill="grey20")

def createFood():
    global foodCoord
    global food

    grid.delete(food)

    while True:
        foodx = random.randint(1, numOfLine - 1)
        foody = random.randint(1, numOfLine - 1)

        foodCoord = [BLOCK * foodx, BLOCK * foody, BLOCK *
                    (foodx + 1), BLOCK * (foody + 1)]
        if foodCoord not in snakeCoord:
            break

    food = grid.create_rectangle(foodCoord, fill="red", width=4)
    grid.tag_lower(food)


def createSnake(coordlist):
    x1, y1, x2, y2 = coordlist
    snakepart = grid.create_rectangle(x1, y1, x2, y2,
                fill="green", width=4)
    grid.tag_raise(snakepart)

    snakeParts.append(snakepart)
    snakeCoord.append([x1, y1, x2, y2])


def moveHead(head):
    if facing == "UP":
        head[1] -= BLOCK
        head[3] -= BLOCK

    elif facing == "LEFT":
        head[0] -= BLOCK
        head[2] -= BLOCK

    elif facing == "RIGHT":
        head[0] += BLOCK
        head[2] += BLOCK

    elif facing == "DOWN":
        head[1] += BLOCK
        head[3] += BLOCK
    return head


def scoreUp():
    global score
    score += 1

    scoreText = "Size: " + str(score)
    scoreDisplay.config(text=scoreText)


def moveSnake():
    head = snakeCoord[-1]

    if head == foodCoord:
        createSnake(head)
        scoreUp()
        createFood()

    snakeCoord.pop(0)
    grid.delete(snakeParts[0])
    snakeParts.pop(0)

    head = moveHead(head)
    createSnake(head)

    if head in snakeCoord[:-3]:
        gameOver()

    for coord in head:
        if coord > HEIGHT or coord < 0:
            gameOver()

    if GAME:
        window.after(FRAMERATE, moveSnake)


def turn(event):
    global facing

    if event.char == "w":
        facing = "UP"
    elif event.char == "a":
        facing = "LEFT"
    elif event.char == "s":
        facing = "DOWN"
    elif event.char == "d":
        facing = "RIGHT"


def gameOver():
    global GAME
    global score
    global highScore
    
    GAME = False

    if score > highScore:
        endCard = [grid.create_text(HEIGHT/2, HEIGHT/3, fill="white", text="GAME OVER", font=("", 50)),
             grid.create_text(HEIGHT/2, HEIGHT/3 + 50, fill="white", text=(
                 "-- NEW HIGH SCORE --"), font=("", 30)),
             grid.create_text(HEIGHT/2, HEIGHT/3 + 80, fill="white", text="Press ENTER to restart")]

        highScore = score
        scorefile = open(path_to_score, "w+")
        scorefile.write(str(highScore))
        scorefile.close()

    else:
        endCard = [grid.create_text(HEIGHT/2, HEIGHT/3, fill="white", text="GAME OVER", font=("", 50)),
             grid.create_text(HEIGHT/2, HEIGHT/3 + 50, fill="white", text="Press ENTER to restart")]
    
    for item in endCard:
        endCards.append(item)

    window.bind("<Return>", restart)

def restart(event=None):
    global endCards
    global score
    global highScore
    global snakeCoord
    global snakeParts
    global GAME
    global facing

    score = 1
    scoreText = "Size: " + str(score)
    scoreDisplay.config(text=scoreText)

    scorefile = open(path_to_score)
    highScore = int(scorefile.read())
    scorefile.close()

    for i in snakeParts:
        grid.delete(i)

    for i in endCards:
        grid.delete(i)

    GAME = True
    facing = "UP"
    snakeCoord = []
    snakeParts = []
    endCards = []

    createSnake([BLOCK*mid, BLOCK*mid, BLOCK*(mid+1), BLOCK*(mid+1)])
    createFood()

    window.after(FRAMERATE, moveSnake())

if __name__ == "__main__":

    scorefile = open(path_to_score)
    highScore = int(scorefile.read())
    scorefile.close()

    createGrid()
    createSnake([BLOCK*mid, BLOCK*mid, BLOCK*(mid+1), BLOCK*(mid+1)])
    createFood()

    window.bind("<Key>", turn)
    window.after(FRAMERATE, moveSnake())

window.mainloop()

from tkinter import *
import random
import math

GAME = True
BLOCK = 30
HEIGHT = BLOCK * 20
WIDTH = HEIGHT
FRAMERATE = 200

snakeParts = []
snakeCoord = []
foodCoord = []

numOfLine = math.floor(HEIGHT/BLOCK)
mid = math.floor(numOfLine/2)

food = 0
score = 0

titleText = "Snake Game"
facing = "UP"

window = Tk()
window.title(titleText)

grid = Canvas(height=HEIGHT, width=WIDTH, bg="black", bd=0)
grid.pack(side=RIGHT, expand=True, fill="both")
# For a resizable window add () to grid.pack

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

    titleText = "Snake Game - Score: " + str(score)
    window.title(titleText)


def moveSnake():
    head = snakeCoord[len(snakeCoord) - 1]

    if head == foodCoord:
        createSnake(head)
        scoreUp()
        createFood()

    snakeCoord.pop(0)
    grid.delete(snakeParts[0])
    snakeParts.pop(0)

    head = moveHead(head)
    createSnake(head)

    for coord in head:
        if coord > 450 or coord < 0:
            gameOver()

    if GAME:
        window.after(FRAMERATE, moveSnake)


def turn(event):
    global facing
    global titleText

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
    pass

createSnake([BLOCK*mid, BLOCK*mid, BLOCK*(mid+1), BLOCK*(mid+1)])
createFood()

window.bind("<Key>", turn)
window.after(FRAMERATE, moveSnake())
window.mainloop()

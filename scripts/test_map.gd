extends Node2D

const MAP_SIZE := Vector2(1280.0, 800.0)
const GRID_STEP: int = 48


func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, MAP_SIZE), Color("172838"))
	for x in range(0, int(MAP_SIZE.x), GRID_STEP):
		draw_line(Vector2(x, 0), Vector2(x, MAP_SIZE.y), Color("203547"))
	for y in range(0, int(MAP_SIZE.y), GRID_STEP):
		draw_line(Vector2(0, y), Vector2(MAP_SIZE.x, y), Color("203547"))
	# Draw the actual collision rectangles so artwork cannot drift from walls.
	for child in $Walls.get_children():
		if child is CollisionShape2D and child.shape is RectangleShape2D:
			var wall := Rect2(child.position - child.shape.size / 2.0, child.shape.size)
			draw_rect(Rect2(wall.position + Vector2(0, 6), wall.size), Color("0e1a27"))
			draw_rect(wall, Color("506981"))
			draw_rect(wall.grow(-3.0), Color("364f66"))
			draw_line(wall.position, wall.position + Vector2(wall.size.x, 0), Color("88a6bd"), 2.0)

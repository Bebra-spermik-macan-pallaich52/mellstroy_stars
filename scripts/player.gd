class_name PrototypePlayer
extends CharacterBody2D

## Movement only. Art and animation are handled by the Sprite child.
@export_range(1.0, 1000.0, 1.0) var move_speed: float = 200.0

var last_direction: StringName = &"down"

@onready var sprite: AnimatedSprite2D = $Sprite


func _ready() -> void:
	_update_visual(Vector2.ZERO)


func _physics_process(_delta: float) -> void:
	var direction := Input.get_vector("move_left", "move_right", "move_up", "move_down")
	velocity = direction * move_speed
	move_and_slide()
	_update_visual(direction)


func _update_visual(direction: Vector2) -> void:
	var moving := not direction.is_zero_approx()
	if moving:
		# On a diagonal with equal components, use the vertical direction.
		if absf(direction.x) > absf(direction.y):
			last_direction = &"right" if direction.x > 0.0 else &"left"
		else:
			last_direction = &"down" if direction.y > 0.0 else &"up"
	sprite.update_state(last_direction, moving)

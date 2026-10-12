extends SceneTree
## Run: godot --headless --path . --script res://tests/movement_test.gd
## These checks use the instantiated game scene and real physics ticks.

const MAIN_SCENE := "res://scenes/main/main.tscn"
const ACTIONS := ["move_left", "move_right", "move_up", "move_down"]
const POSITION_TOLERANCE := 0.6
const CONTACT_TOLERANCE := 0.25

class PhysicsProbe:
	extends Node
	signal sampled(delta: float)

	func _physics_process(delta: float) -> void:
		sampled.emit(delta)


var _main: Node
var _player: CharacterBody2D
var _sprite: AnimatedSprite2D
var _probe: PhysicsProbe
var _watchdog: Timer
var _checks := 0
var _failures := 0
var _cases_run := 0
var _speed := 200.0
var _finishing := false


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	_watchdog = Timer.new()
	_watchdog.wait_time = 30.0
	_watchdog.one_shot = true
	_watchdog.process_mode = Node.PROCESS_MODE_ALWAYS
	_watchdog.timeout.connect(_on_timeout)
	root.add_child(_watchdog)
	_watchdog.start()

	var packed: PackedScene = load(MAIN_SCENE) as PackedScene
	_check(packed != null, "Main scene loads")
	if packed == null:
		_finish()
		return

	_main = packed.instantiate()
	root.add_child(_main)
	_player = _main.find_child("Player", true, false) as CharacterBody2D
	_check(_player != null, "Player is a CharacterBody2D")
	if _player == null:
		_finish()
		return
	_sprite = _player.get_node_or_null("Sprite") as AnimatedSprite2D
	_check(_sprite != null, "Player has AnimatedSprite2D named Sprite")
	if _sprite == null:
		_finish()
		return

	# A sibling added after the game scene samples after the player's physics
	# callback. Unlike process_frame, this gives exactly one completed physics
	# tick per sample even when several physics ticks precede a rendered frame.
	_probe = PhysicsProbe.new()
	root.add_child(_probe)
	_release_actions()
	await _step_frames(2)
	_speed = float(_player.get("move_speed"))

	_case("Project configuration and starting state")
	_check(is_equal_approx(_speed, 200.0), "Default movement speed is 200 px/s")
	_check(_player.motion_mode == CharacterBody2D.MOTION_MODE_FLOATING,
		"Top-down movement uses floating motion mode")
	_check(_player.global_position.distance_to(Vector2(200, 400)) < 0.01,
		"Player starts at the documented spawn")
	_check(_sprite.sprite_frames != null, "SpriteFrames resource exists")
	if _sprite.sprite_frames == null:
		_finish()
		return
	_check_input_map()
	for direction in ["up", "down", "left", "right"]:
		for state in ["idle", "walk"]:
			var animation := StringName("%s_%s" % [state, direction])
			_check(_sprite.sprite_frames.has_animation(animation),
				"Animation state exists: %s" % animation)
			if _sprite.sprite_frames.has_animation(animation):
				_check(_sprite.sprite_frames.get_frame_count(animation) > 0,
					"Animation state has a placeholder frame: %s" % animation)
	if _failures > 0:
		_finish()
		return

	await _test_movement_vectors()
	await _test_direction_and_stop()
	await _test_opposite_inputs()
	await _test_dominant_direction()
	await _test_speed_configuration()
	await _test_outer_boundaries()
	await _test_obstacles()
	await _test_sliding()
	_finish()


func _check_input_map() -> void:
	var keys := {
		"move_left": KEY_A,
		"move_right": KEY_D,
		"move_up": KEY_W,
		"move_down": KEY_S,
	}
	for action in keys:
		var exists := InputMap.has_action(action)
		_check(exists, "Input action exists: %s" % action)
		if not exists:
			continue
		var found_physical_key := false
		for event in InputMap.action_get_events(action):
			if event is InputEventKey and event.physical_keycode == keys[action]:
				found_physical_key = true
		_check(found_physical_key, "Physical WASD mapping exists: %s" % action)


func _test_movement_vectors() -> void:
	_case("Cardinal and diagonal displacement at a fixed speed")
	var cases := [
		{"label": "right", "actions": ["move_right"], "vector": Vector2.RIGHT},
		{"label": "left", "actions": ["move_left"], "vector": Vector2.LEFT},
		{"label": "up", "actions": ["move_up"], "vector": Vector2.UP},
		{"label": "down", "actions": ["move_down"], "vector": Vector2.DOWN},
		{"label": "up/right", "actions": ["move_up", "move_right"], "vector": Vector2(1, -1)},
		{"label": "up/left", "actions": ["move_up", "move_left"], "vector": Vector2(-1, -1)},
		{"label": "down/right", "actions": ["move_down", "move_right"], "vector": Vector2(1, 1)},
		{"label": "down/left", "actions": ["move_down", "move_left"], "vector": Vector2(-1, 1)},
	]
	for sample in cases:
		await _reset_position(Vector2(200, 400))
		var start := _player.global_position
		_press_actions(sample["actions"])
		var elapsed: float = await _step_frames(12)
		var actual := _player.global_position - start
		var direction: Vector2 = sample["vector"]
		var expected := direction.normalized() * _speed * elapsed
		_check(actual.distance_to(expected) <= POSITION_TOLERANCE,
			"Expected movement displacement: %s" % sample["label"],
			"expected %s, got %s" % [expected, actual])
		_check(absf(actual.length() - _speed * elapsed) <= POSITION_TOLERANCE,
			"Equal movement speed: %s" % sample["label"])
		_check(absf(_player.velocity.length() - _speed) < 0.01,
			"Velocity is normalized: %s" % sample["label"])


func _test_direction_and_stop() -> void:
	_case("Immediate response, animation states and preserved idle facing")
	for direction in ["up", "down", "left", "right"]:
		await _reset_position(Vector2(200, 400))
		var start := _player.global_position
		Input.action_press(StringName("move_%s" % direction))
		var elapsed: float = await _step_frames(1)
		_check(absf(_player.global_position.distance_to(start) - _speed * elapsed) < POSITION_TOLERANCE,
			"Movement responds on the first physics tick: %s" % direction)
		_check(String(_player.get("last_direction")) == direction,
			"Movement updates facing: %s" % direction)
		_check(_sprite.animation == StringName("walk_%s" % direction),
			"Movement selects walk state: %s" % direction)
		_check_portrait_and_marker(direction)
		_release_actions()
		var stop_position := _player.global_position
		await _step_frames(1)
		_check(_player.global_position.distance_to(stop_position) < 0.001,
			"Release stops movement on the next physics tick: %s" % direction)
		_check(_player.velocity.is_zero_approx(), "Release clears velocity: %s" % direction)
		_check(String(_player.get("last_direction")) == direction,
			"Idle preserves last facing: %s" % direction)
		_check(_sprite.animation == StringName("idle_%s" % direction),
			"Release selects matching idle state: %s" % direction)
		_check_portrait_and_marker(direction)
		await _step_frames(5)
		_check(_player.global_position.distance_to(stop_position) < 0.001,
			"Idle has no drift: %s" % direction)


func _test_opposite_inputs() -> void:
	_case("Opposing keys cancel without drift")
	for actions in [["move_left", "move_right"], ["move_up", "move_down"], ACTIONS]:
		await _reset_position(Vector2(200, 400))
		var start := _player.global_position
		var facing := String(_player.get("last_direction"))
		_press_actions(actions)
		await _step_frames(5)
		_check(_player.global_position.distance_to(start) < 0.001,
			"Opposing keys do not move the player: %s" % [actions])
		_check(_player.velocity.is_zero_approx(), "Opposing keys produce zero velocity")
		_check(String(_player.get("last_direction")) == facing,
			"Opposing keys preserve the previous facing")


func _test_dominant_direction() -> void:
	_case("Dominant and tied diagonal directions select stable states")
	await _reset_position(Vector2(200, 400))
	Input.action_press("move_right", 0.6)
	Input.action_press("move_up", 1.0)
	await _step_frames(3)
	_check(String(_player.get("last_direction")) == "up",
		"Vertical dominant input selects up")
	_check(_sprite.animation == &"walk_up", "Vertical dominant input selects walk_up")
	await _reset_position(Vector2(200, 400))
	Input.action_press("move_left", 1.0)
	Input.action_press("move_down", 0.6)
	await _step_frames(3)
	_check(String(_player.get("last_direction")) == "left",
		"Horizontal dominant input selects left")
	_check(_sprite.animation == &"walk_left", "Horizontal dominant input selects walk_left")
	await _reset_position(Vector2(200, 400))
	_press_actions(["move_right", "move_down"])
	await _step_frames(1)
	var tied_facing := String(_player.get("last_direction"))
	_check(tied_facing in ["right", "down"], "Tied diagonal chooses one pressed direction")
	await _step_frames(6)
	_check(String(_player.get("last_direction")) == tied_facing,
		"Tied diagonal keeps a stable direction across physics ticks")
	_release_actions()
	await _step_frames(1)
	_check(_sprite.animation == StringName("idle_%s" % tied_facing),
		"Diagonal release preserves its selected direction")


func _test_speed_configuration() -> void:
	_case("Movement speed can be configured independently")
	await _reset_position(Vector2(200, 400))
	var configured_speed := 120.0
	_player.set("move_speed", configured_speed)
	var start := _player.global_position
	_press_actions(["move_right", "move_up"])
	var elapsed: float = await _step_frames(12)
	_check(absf(_player.global_position.distance_to(start) - configured_speed * elapsed) <= POSITION_TOLERANCE,
		"Changing move_speed changes actual diagonal displacement")
	_release_actions()
	_player.set("move_speed", _speed)
	await _step_frames(1)


func _test_outer_boundaries() -> void:
	_case("All four map boundaries physically stop the player")
	var cases := [
		{"label": "top", "start": Vector2(200, 90), "action": "move_up", "axis": "y", "contact": 42.0, "normal": Vector2.DOWN},
		{"label": "bottom", "start": Vector2(200, 710), "action": "move_down", "axis": "y", "contact": 758.0, "normal": Vector2.UP},
		{"label": "left", "start": Vector2(90, 120), "action": "move_left", "axis": "x", "contact": 42.0, "normal": Vector2.RIGHT},
		{"label": "right", "start": Vector2(1190, 120), "action": "move_right", "axis": "x", "contact": 1238.0, "normal": Vector2.LEFT},
	]
	for sample in cases:
		await _reset_position(sample["start"])
		Input.action_press(sample["action"])
		await _step_frames(32)
		var coordinate: float = _player.global_position[sample["axis"]]
		_check(absf(coordinate - sample["contact"]) <= CONTACT_TOLERANCE,
			"Boundary stops at collider contact: %s" % sample["label"],
			"expected %s, got %s" % [sample["contact"], coordinate])
		_check(_has_collision_normal(sample["normal"]),
			"Boundary is a real physics collision: %s" % sample["label"])
		# Floating mode may retain the requested velocity against a wall. Actual
		# body displacement, rather than its requested velocity, proves blocking.
		var contact_position := _player.global_position
		await _step_frames(5)
		_check(_player.global_position.distance_to(contact_position) < 0.01,
			"Holding movement against boundary cannot move through it: %s" % sample["label"])
		_check_inside_map()


func _test_obstacles() -> void:
	_case("Interior obstacles block movement from multiple sides")
	var cases := [
		{"label": "central obstacle left", "start": Vector2(450, 400), "action": "move_right", "axis": "x", "contact": 512.0, "normal": Vector2.LEFT},
		{"label": "central obstacle right", "start": Vector2(830, 400), "action": "move_left", "axis": "x", "contact": 768.0, "normal": Vector2.RIGHT},
		{"label": "central obstacle top", "start": Vector2(640, 300), "action": "move_down", "axis": "y", "contact": 350.0, "normal": Vector2.UP},
		{"label": "central obstacle bottom", "start": Vector2(640, 500), "action": "move_up", "axis": "y", "contact": 450.0, "normal": Vector2.DOWN},
		{"label": "upper obstacle left", "start": Vector2(250, 240), "action": "move_right", "axis": "x", "contact": 294.0, "normal": Vector2.LEFT},
		{"label": "lower obstacle top", "start": Vector2(930, 420), "action": "move_down", "axis": "y", "contact": 460.0, "normal": Vector2.UP},
	]
	for sample in cases:
		await _reset_position(sample["start"])
		Input.action_press(sample["action"])
		await _step_frames(32)
		var coordinate: float = _player.global_position[sample["axis"]]
		_check(absf(coordinate - sample["contact"]) <= CONTACT_TOLERANCE,
			"Obstacle stops at collider contact: %s" % sample["label"],
			"expected %s, got %s" % [sample["contact"], coordinate])
		_check(_has_collision_normal(sample["normal"]),
			"Obstacle produces a real collision: %s" % sample["label"])


func _test_sliding() -> void:
	_case("Diagonal movement slides along walls and remains inside corners")
	await _reset_position(Vector2(500, 390))
	var start := _player.global_position
	_press_actions(["move_right", "move_down"])
	var elapsed: float = await _step_frames(10)
	_check(absf(_player.global_position.x - 512.0) <= CONTACT_TOLERANCE,
		"Central wall blocks the perpendicular component while sliding")
	_check_sliding_distance(start, elapsed, "Central wall")
	_check(_has_collision_normal(Vector2.LEFT), "Sliding retains central wall contact")

	await _reset_position(Vector2(45, 120))
	start = _player.global_position
	_press_actions(["move_left", "move_down"])
	elapsed = await _step_frames(10)
	_check(absf(_player.global_position.x - 42.0) <= CONTACT_TOLERANCE,
		"Map boundary blocks the perpendicular component while sliding")
	_check_sliding_distance(start, elapsed, "Map boundary")
	_check_inside_map()

	await _reset_position(Vector2(50, 50))
	_press_actions(["move_left", "move_up"])
	await _step_frames(15)
	_check(_player.global_position.distance_to(Vector2(42, 42)) <= POSITION_TOLERANCE,
		"Two adjoining boundary walls stop diagonal corner movement")
	_check_inside_map()


func _reset_position(position: Vector2) -> void:
	_release_actions()
	_player.global_position = position
	_player.velocity = Vector2.ZERO
	await _step_frames(2)


func _step_frames(count: int) -> float:
	var elapsed := 0.0
	for _frame in range(count):
		var delta: float = await _probe.sampled
		elapsed += delta
	return elapsed


func _press_actions(actions: Array) -> void:
	for action in actions:
		Input.action_press(StringName(action))


func _release_actions() -> void:
	for action in ACTIONS:
		if InputMap.has_action(action):
			Input.action_release(action)


func _has_collision_normal(expected: Vector2) -> bool:
	for index in range(_player.get_slide_collision_count()):
		if _player.get_slide_collision(index).get_normal().dot(expected) > 0.99:
			return true
	return false


func _check_inside_map() -> void:
	var position := _player.global_position
	_check(position.x >= 42.0 - CONTACT_TOLERANCE and position.x <= 1238.0 + CONTACT_TOLERANCE
		and position.y >= 42.0 - CONTACT_TOLERANCE and position.y <= 758.0 + CONTACT_TOLERANCE,
		"Entire player collider remains within map boundaries", "position %s" % position)


func _check_sliding_distance(start: Vector2, elapsed: float, label: String) -> void:
	# Floating mode keeps movement speed when a diagonal hits a wall. Before
	# contact, its tangent component is speed / sqrt(2); after contact it can
	# use the full speed along the wall. The transition occurs within a tick.
	var tangent_distance := _player.global_position.y - start.y
	var minimum := _speed * elapsed / sqrt(2.0) - POSITION_TOLERANCE
	var maximum := _speed * elapsed + POSITION_TOLERANCE
	_check(tangent_distance >= minimum and tangent_distance <= maximum,
		"%s permits tangent movement within the configured speed" % label,
		"expected %.3f..%.3f, got %.3f" % [minimum, maximum, tangent_distance])
	var real_velocity := _player.get_real_velocity()
	# move_and_slide's safe margin consumes a small part of each collision
	# tick; allow that geometric correction instead of requiring ideal speed.
	var velocity_tolerance := _player.safe_margin * Engine.physics_ticks_per_second + 0.1
	_check(absf(real_velocity.x) < 0.1 and absf(real_velocity.y - _speed) < velocity_tolerance,
		"%s slides near Godot floating-mode speed after contact" % label,
		"expected (0, %.3f), got %s" % [_speed, real_velocity])


func _check_portrait_and_marker(direction: String) -> void:
	var marker := _player.get_node_or_null("FacingMarker") as Sprite2D
	if marker == null:
		return
	var angles := {"down": 0.0, "left": PI / 2.0, "up": PI, "right": -PI / 2.0}
	_check(absf(_sprite.rotation) < 0.001, "Static portrait remains upright: %s" % direction)
	_check(absf(angle_difference(marker.rotation, angles[direction])) < 0.001,
		"Facing marker shows the selected direction: %s" % direction)


func _case(label: String) -> void:
	_cases_run += 1
	print("Case %d: %s" % [_cases_run, label])


func _check(condition: bool, label: String, details: String = "") -> void:
	_checks += 1
	if not condition:
		_failures += 1
		push_error("FAIL: %s%s" % [label, ": " + details if not details.is_empty() else ""])


func _on_timeout() -> void:
	_check(false, "Test runner exceeded its 30-second deadline")
	_finish()


func _finish() -> void:
	if _finishing:
		return
	_finishing = true
	_release_actions()
	if is_instance_valid(_watchdog):
		_watchdog.stop()
	if _checks == 0 or _cases_run == 0:
		_check(false, "At least one test case and check must execute")
	print("Movement checks: %d passed, %d failed, %d total across %d cases." % [
		_checks - _failures, _failures, _checks, _cases_run
	])
	quit(1 if _failures > 0 else 0)

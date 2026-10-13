UPDATE users SET username = 'admin', email = 'admin@example.com', display_name = 'Admin' WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
UPDATE users SET username = 'teacher', email = 'teacher@example.com', display_name = 'Teacher' WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
DELETE FROM staff_roles WHERE user_id NOT IN ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2');
INSERT OR REPLACE INTO staff_roles (id, user_id, role, active) VALUES ('sr_admin_1', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'admin', 1);
INSERT OR REPLACE INTO staff_roles (id, user_id, role, active) VALUES ('sr_admin_2', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'teacher', 1);
INSERT OR REPLACE INTO staff_roles (id, user_id, role, active) VALUES ('sr_teacher_1', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'teacher', 1);
UPDATE classes SET teacher_user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';

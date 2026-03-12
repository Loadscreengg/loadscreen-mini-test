const express = require('express');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.get('/api/employees', (req, res) => {
  const { search, department, sort = 'id', order = 'asc' } = req.query;

  const allowedSort = ['id', 'name', 'department', 'position', 'hire_date', 'salary'];
  const allowedOrder = ['asc', 'desc'];
  const sortCol = allowedSort.includes(sort) ? sort : 'id';
  const sortOrder = allowedOrder.includes(order) ? order : 'asc';

  let query = 'SELECT * FROM employees WHERE 1=1';
  const params = [];

  if (search) {
    query += ' AND (name LIKE ? OR position LIKE ? OR email LIKE ?)';
    const like = `%${search}%`;
    params.push(like, like, like);
  }

  if (department && department !== 'all') {
    query += ' AND department = ?';
    params.push(department);
  }

  query += ` ORDER BY ${sortCol} ${sortOrder.toUpperCase()}`;

  const employees = db.prepare(query).all(...params);
  res.json(employees);
});

app.get('/api/departments', (req, res) => {
  const departments = db.prepare('SELECT DISTINCT department FROM employees ORDER BY department').all();
  res.json(departments.map(d => d.department));
});

//  Task 1 — Add Employee - POST /api/employees
app.post('/api/employees', (req, res) => {
  const { name, department, position, email, phone, hire_date, salary } = req.body;

  // Validate required information
  if (!name || !department || !position || !email || !phone || !hire_date || !salary) {
    return res.status(400).json({ error: 'Missing required information' });
  }

  // Insert new employee into the database
  try {
    const result = db.prepare(
      'INSERT INTO employees (name, department, position, email, phone, hire_date, salary) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(name, department, position, email, phone, hire_date, Number(salary));
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (err) {
    // Handle duplicate email (UNIQUE constraint)
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// Task 2 — Edit Employee - PUT /api/employees/:id
app.put('/api/employees/:id', (req, res) => {
  const { id } = req.params;
  const { name, department, position, email, phone, hire_date, salary } = req.body;

  // Validate required information 
  if (!name || !department || !position || !email || !phone || !hire_date || !salary) {
    return res.status(400).json({ error: 'Missing required information' });
  }

  // Update data
  try {
    const result = db.prepare(
      'UPDATE employees SET name=?, department=?, position=?, email=?, phone=?, hire_date=?, salary=? WHERE id=?'
    ).run(name, department, position, email, phone, hire_date, Number(salary), id);

    if (result.changes === 0) return res.status(404).json({ error: 'Employee not found' });
    res.json({ success: true });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// Task 3 — Delete Employee - DELETE /api/employees/:id
app.delete('/api/employees/:id', (req, res) => {
  const { id } = req.params;
  const result = db.prepare('DELETE FROM employees WHERE id = ?').run(id);
  if (result.changes === 0) return res.status(404).json({ error: 'Employee not found' });
  res.json({ success: true });
});

// Task 5 — Salary by Department - aggregate total salary per department
app.get('/api/salary-by-department', (_req, res) => {
  const rows = db.prepare(
    'SELECT department, SUM(salary) AS total FROM employees GROUP BY department ORDER BY department'
  ).all();
  res.json(rows); // [{ department, total }, …]
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

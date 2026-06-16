// ===================== CONFIGURACIONES DEL SISTEMA =====================
app.get('/api/system-settings', async (req, res) => {
    try {
        const rows = await pool.query("SELECT * FROM system_settings");
        const settings = {};
        rows.rows.forEach(r => {
            if (r.key === 'active_evaluation_box') {
                settings[r.key] = r.value === 'true';
            } else {
                settings[r.key] = r.value;
            }
        });
        res.json({
            active_evaluation_box: settings.active_evaluation_box || false,
            evaluation_box_title: settings.evaluation_box_title || 'Evaluación de Actividad',
            evaluation_box_url: settings.evaluation_box_url || '',
            evaluation_box_type: 'external',
            theme_color: settings.theme_color || 'indigo'
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/system-settings', authAdmin, async (req, res) => {
    try {
        const { active_evaluation_box, evaluation_box_title, evaluation_box_url, evaluation_box_type, theme_color } = req.body;
        
        await pool.query("INSERT INTO system_settings (key, value) VALUES ('active_evaluation_box', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [active_evaluation_box ? 'true' : 'false']);
        if (evaluation_box_title !== undefined) {
            await pool.query("INSERT INTO system_settings (key, value) VALUES ('evaluation_box_title', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [evaluation_box_title]);
        }
        if (evaluation_box_url !== undefined) {
            await pool.query("INSERT INTO system_settings (key, value) VALUES ('evaluation_box_url', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [evaluation_box_url]);
        }
        await pool.query("INSERT INTO system_settings (key, value) VALUES ('evaluation_box_type', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", ['external']);
        if (theme_color !== undefined) {
            await pool.query("INSERT INTO system_settings (key, value) VALUES ('theme_color', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [theme_color]);
        }
        
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
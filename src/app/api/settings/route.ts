/**
 * API Route for Settings (app_config)
 * Handles fetching and updating application settings and active prompt ID.
 */
import { NextResponse } from 'next/server';
import { Settings } from '@/types';
import { updateSettingsRequestSchema } from '@/types/contracts';
import { getConfig, saveConfig } from '@/lib/repositories/settingsRepository';
import { errorResponse, parseRequestBody } from '@/lib/apiValidation';

// Default settings - consider moving to a shared constants file if used elsewhere
const DEFAULT_SETTINGS: Settings = {
    autoSave: true,
    defaultPromptName: "New Prompt",
    defaultSectionType: "instruction",
    theme: "dark",
    markdownPromptingEnabled: false,
    systemPrompt: "# Prompt Structure/System Guide...", // Keep it concise or load from a file if very long
};

/**
 * GET /api/settings
 * Fetches the current application settings and active_prompt_id.
 */
export async function GET() {
    try {
        const config = getConfig();

        return NextResponse.json({
            settings: config.settings ?? DEFAULT_SETTINGS,
            activePromptId: config.activePromptId,
        });
    } catch (error) {
        console.error('Error fetching settings:', error);
        return errorResponse('Failed to fetch settings', 500);
    }
}

/**
 * POST /api/settings
 * Creates or updates the application settings and active_prompt_id.
 */
export async function POST(request: Request) {
    try {
        const parsed = await parseRequestBody(request, updateSettingsRequestSchema);
        if (!parsed.ok) return parsed.response;

        const saved = saveConfig(parsed.data, DEFAULT_SETTINGS);

        return NextResponse.json({
            message: 'Settings updated successfully',
            settings: saved.settings,
            activePromptId: saved.activePromptId,
        });
    } catch (error) {
        console.error('Error updating settings:', error);
        return errorResponse('Failed to update settings', 500);
    }
}

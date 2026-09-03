import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
    // The end-to-end run builds into its own directory, so it does not fight a
    // dev server writing to .next at the same time.
    distDir: process.env.NEXT_DIST_DIR || '.next',
    sassOptions: {
        includePaths: [path.join(__dirname, 'src/styles')],
        prependData: `
        @use "variables/colors" as colors;
        @use "variables/mixins" as mixins;
        @use "variables/typography" as typography;
        @use "global/reset";
        @use "global/base";
        `
    },
    devIndicators: false
};

export default nextConfig;

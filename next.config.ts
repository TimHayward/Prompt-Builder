import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
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

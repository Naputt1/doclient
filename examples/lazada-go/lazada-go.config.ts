import { defineConfig } from '@doclient/cli';
import { createGoRenderer } from '@doclient/renderer-go';
import { lazadaProfile } from './profile.js';
import { lazadaOpenAPISource } from './source-lazada-openapi';

export default defineConfig({
  name: 'go-lazada-v1',
  source: lazadaOpenAPISource,
  output: createGoRenderer(lazadaProfile, {
    package: 'golazada',
    module: 'github.com/naputt1/go-lazada-v1',
  }),
  outputDir: './output-lazada',
  mappings: {
    typeOverrides: {
      item_id: 'int64',
      seller_id: 'int64',
      shop_id: 'int64',
      order_id: 'int64',
      order_item_id: 'int64',
      product_id: 'int64',
      sku_id: 'int64',
      category_id: 'int64',
      primary_category: 'int64',
      page_size: 'int64',
      page_index: 'int64',
      offset: 'int64',
      limit: 'int64',
      total: 'int64',
      total_products: 'int64',
      total_count: 'int64',
      is_active: 'bool',
      is_activated: 'bool',
      success: 'bool',
      status: 'string',
    },
    ignoreAPIs: [],
    staticModules: { values: ['product'], segment: 1 },
  },
});

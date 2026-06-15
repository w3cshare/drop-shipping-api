import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';

@Controller()
export class AppController {
  @Get()
  async index(@Query('shop') shop: string, @Req() req: Request, @Res() res: Response) {
    if (shop) {
      return res.json({
        status: 'success',
        message: 'Shopify OAuth authentication completed',
        shop,
        timestamp: new Date().toISOString(),
      });
    }
    
    return res.json({
      status: 'ok',
      message: 'Shopify App API is running',
      timestamp: new Date().toISOString(),
    });
  }
}

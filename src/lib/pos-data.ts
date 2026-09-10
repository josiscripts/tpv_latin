import incaKola from "@/assets/inca-kola.jpg";
import maltinPolar from "@/assets/maltin-polar.jpg";
import chifles from "@/assets/chifles.jpg";
import panela from "@/assets/panela.jpg";
import ajiAmarillo from "@/assets/aji-amarillo.jpg";
import dulceLeche from "@/assets/dulce-leche.jpg";
import harinaPan from "@/assets/harina-pan.jpg";
import yuca from "@/assets/yuca.jpg";

export type StockState = "ok" | "low" | "critical" | "out";
export type Product = { id:number; name:string; category:string; supplier:string; price:number; cost:number; stock:number; min:number; barcode:string; sku:string; image:string; state:StockState };

export const products: Product[] = [
  { id:1,name:"Inca Kola 300 ml",category:"Bebidas",supplier:"Andes Foods",price:2.5,cost:1.35,stock:42,min:12,barcode:"7750011001847",sku:"BEB-INK-300",image:incaKola,state:"ok" },
  { id:2,name:"Maltín Polar 330 ml",category:"Bebidas",supplier:"Caribe Imports",price:2.25,cost:1.2,stock:8,min:12,barcode:"7590006701218",sku:"BEB-MAL-330",image:maltinPolar,state:"low" },
  { id:3,name:"Chifles salados 150 g",category:"Snacks",supplier:"Andes Foods",price:2.95,cost:1.45,stock:24,min:10,barcode:"8437019431502",sku:"SNA-CHI-150",image:chifles,state:"ok" },
  { id:4,name:"Panela colombiana 500 g",category:"Dulces",supplier:"Sabores del Sur",price:3.8,cost:2.1,stock:5,min:8,barcode:"7702011105004",sku:"DUL-PAN-500",image:panela,state:"critical" },
  { id:5,name:"Ají amarillo pasta 225 g",category:"Conservas",supplier:"Andes Foods",price:4.6,cost:2.55,stock:16,min:6,barcode:"7750106002254",sku:"CON-AJI-225",image:ajiAmarillo,state:"ok" },
  { id:6,name:"Dulce de leche 450 g",category:"Dulces",supplier:"Pampa Selecta",price:4.25,cost:2.3,stock:11,min:10,barcode:"7790580104501",sku:"DUL-DDL-450",image:dulceLeche,state:"low" },
  { id:7,name:"Harina PAN blanca 1 kg",category:"Panadería",supplier:"Caribe Imports",price:3.4,cost:1.85,stock:36,min:15,barcode:"7591002001012",sku:"PAN-HAR-1KG",image:harinaPan,state:"ok" },
  { id:8,name:"Yuca congelada 1 kg",category:"Congelados",supplier:"Tropical Fresh",price:5.9,cost:3.2,stock:0,min:8,barcode:"8410101081006",sku:"CON-YUC-1KG",image:yuca,state:"out" },
];

export const salesWeek = [{d:"Lun",v:380},{d:"Mar",v:445},{d:"Mié",v:405},{d:"Jue",v:520},{d:"Vie",v:610},{d:"Sáb",v:780},{d:"Hoy",v:482}];
export const categorySales = [{name:"Bebidas",value:34},{name:"Snacks",value:20},{name:"Conservas",value:16},{name:"Dulces",value:14},{name:"Lácteos",value:9},{name:"Congelados",value:7}];
export const monthly = [{m:"Ene",sales:9800,profit:3100},{m:"Feb",sales:11200,profit:3500},{m:"Mar",sales:10800,profit:3300},{m:"Abr",sales:12600,profit:4100},{m:"May",sales:13900,profit:4550},{m:"Jun",sales:15100,profit:4920}];
export const suppliers = [
  {name:"Andes Foods",initials:"AF",phone:"+34 910 284 510",email:"pedidos@andesfoods.es",count:38,last:"08 sep 2026"},
  {name:"Caribe Imports",initials:"CI",phone:"+34 936 184 225",email:"ventas@caribeimports.es",count:27,last:"06 sep 2026"},
  {name:"Sabores del Sur",initials:"SS",phone:"+34 963 215 748",email:"hola@saboresdelsur.es",count:19,last:"02 sep 2026"},
  {name:"Pampa Selecta",initials:"PS",phone:"+34 915 882 143",email:"compras@pampaselecta.es",count:14,last:"29 ago 2026"},
];
export const tickets = [
  {id:"#V-10482",time:"11:18",items:4,payment:"Tarjeta",total:24.85,profit:9.42,status:"Completada"},
  {id:"#V-10481",time:"10:56",items:2,payment:"Efectivo",total:8.15,profit:3.25,status:"Completada"},
  {id:"#V-10480",time:"10:41",items:7,payment:"Tarjeta",total:41.7,profit:14.88,status:"Completada"},
  {id:"#V-10479",time:"10:05",items:1,payment:"Efectivo",total:3.4,profit:1.55,status:"Reembolsada"},
  {id:"#V-10478",time:"09:42",items:5,payment:"Tarjeta",total:31.2,profit:11.06,status:"Completada"},
];
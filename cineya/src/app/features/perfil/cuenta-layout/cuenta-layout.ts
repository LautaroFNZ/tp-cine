import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-cuenta-layout',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './cuenta-layout.html',
  styleUrl: './cuenta-layout.scss'
})
export class CuentaLayout {}